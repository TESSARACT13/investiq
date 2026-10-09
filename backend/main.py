import asyncio
import gzip
import json
import os
import sys
import sysconfig
import threading
from collections import deque
from datetime import datetime, timedelta, timezone
from typing import Set
from importlib.util import module_from_spec, spec_from_file_location
from urllib.parse import quote

# The Upstox SDK declares a legacy PyPI package named `uuid`. Vercel vendors
# third-party packages ahead of the standard library, so preload Python's
# built-in uuid module before importing httpx or the SDK.
_stdlib_uuid = spec_from_file_location(
    "uuid",
    os.path.join(sysconfig.get_path("stdlib"), "uuid.py"),
)
if _stdlib_uuid and _stdlib_uuid.loader:
    _uuid_module = module_from_spec(_stdlib_uuid)
    sys.modules["uuid"] = _uuid_module
    _stdlib_uuid.loader.exec_module(_uuid_module)

import httpx
import upstox_client
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from ai.scoring import calculate_score
from market.stocks import STOCK_SYMBOLS


# ============================================================
# ENVIRONMENT
# ============================================================

load_dotenv()


# ============================================================
# APP
# ============================================================

app = FastAPI(
    title="INVESTIQ API",
    description="Real-time AI investment and paper trading backend",
    version="1.5.0",
)


# ============================================================
# CORS
# ============================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip()
        for origin in os.getenv(
            "CORS_ORIGINS",
            "http://localhost:3000,http://127.0.0.1:3000",
        ).split(",")
        if origin.strip()
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# STOCK UNIVERSE
# ============================================================

STOCKS: dict[str, str] = {}
STOCK_NAMES: dict[str, str] = {}


# ============================================================
# GLOBAL STATE
# ============================================================

clients: Set[WebSocket] = set()

streamer = None

main_loop = None

latest_prices: dict[str, dict] = {}
last_quote_refresh: datetime | None = None
market_data_message: str | None = None


# ============================================================
# REAL LIVE SHORT-TIMEFRAME CANDLE BUFFER
# ============================================================
#
# IMPORTANT:
#
# These candles are created ONLY from real Upstox
# WebSocket market data.
#
# We do NOT fabricate historical 5s / 10s / 30s candles.
#
# 5,000 x 5 seconds = 25,000 seconds
#                     = approximately 6h 56m
#
# This covers a normal NSE trading session.
#
# We maintain only 5-second candles.
# 10s and 30s candles are derived when requested.
# ============================================================

LIVE_CANDLE_LIMIT = 5000

live_candles: dict[str, deque] = {}

# The Upstox WebSocket callback runs in a different thread
# from FastAPI requests, so protect candle buffers.
live_candle_lock = threading.RLock()


def initialize_live_candle_buffers():
    """
    Create an empty 5-second candle buffer
    for every supported stock.
    """

    with live_candle_lock:

        for symbol in STOCKS:

            if symbol not in live_candles:

                live_candles[symbol] = deque(
                    maxlen=LIVE_CANDLE_LIMIT
                )


# ============================================================
# TIME HELPERS
# ============================================================

IST = timezone(timedelta(hours=5, minutes=30))


def timestamp_to_ist(timestamp_ms: int) -> str:
    """
    Convert Unix milliseconds into an explicit
    Asia/Kolkata-style ISO timestamp.

    Example:
        2026-09-29T09:15:05+05:30
    """

    return datetime.fromtimestamp(
        timestamp_ms / 1000,
        tz=IST,
    ).isoformat()


def get_live_candle_bucket(timestamp_ms: int) -> int:
    """
    Convert a timestamp into the beginning of
    a 5-second bucket.

    Examples:

        09:15:02 -> 09:15:00
        09:15:04 -> 09:15:00
        09:15:07 -> 09:15:05
    """

    bucket_size_ms = 5000

    return (
        timestamp_ms // bucket_size_ms
    ) * bucket_size_ms


# ============================================================
# REAL 5-SECOND CANDLE AGGREGATION
# ============================================================

def update_live_5s_candle(
    symbol: str,
    price: float,
    volume: int,
    timestamp_ms: int,
):
    """
    Aggregate real Upstox WebSocket ticks into
    real 5-second OHLC candles.

    No artificial prices are generated.
    """

    if symbol not in live_candles:

        live_candles[symbol] = deque(
            maxlen=LIVE_CANDLE_LIMIT
        )

    bucket = get_live_candle_bucket(
        timestamp_ms
    )

    with live_candle_lock:

        candles = live_candles[symbol]

        # ----------------------------------------------------
        # Update current candle
        # ----------------------------------------------------

        if (
            candles
            and candles[-1]["time_ms"] == bucket
        ):

            candle = candles[-1]

            candle["high"] = max(
                candle["high"],
                price,
            )

            candle["low"] = min(
                candle["low"],
                price,
            )

            candle["close"] = price

            candle["volume"] += max(
                0,
                volume,
            )

            return

        # ----------------------------------------------------
        # Handle a tick that belongs to an existing
        # candle rather than the newest candle.
        #
        # This protects against occasional out-of-order
        # WebSocket messages.
        # ----------------------------------------------------

        for candle in reversed(candles):

            if candle["time_ms"] == bucket:

                candle["high"] = max(
                    candle["high"],
                    price,
                )

                candle["low"] = min(
                    candle["low"],
                    price,
                )

                candle["close"] = price

                candle["volume"] += max(
                    0,
                    volume,
                )

                return

            if candle["time_ms"] < bucket:

                break

        # ----------------------------------------------------
        # New 5-second candle
        # ----------------------------------------------------

        candles.append(
            {
                "time_ms": bucket,
                "time": timestamp_to_ist(
                    bucket
                ),
                "open": float(price),
                "high": float(price),
                "low": float(price),
                "close": float(price),
                "volume": max(
                    0,
                    int(volume),
                ),
            }
        )


# ============================================================
# LIVE CANDLE AGGREGATION
# ============================================================

def aggregate_live_candles(
    symbol: str,
    seconds: int,
):
    """
    Convert real 5-second candles into
    10-second or 30-second candles.

    No artificial prices are generated.
    """

    if symbol not in live_candles:
        return []

    if seconds not in (
        5,
        10,
        30,
    ):
        return []

    with live_candle_lock:

        source = list(
            live_candles[symbol]
        )

    if not source:
        return []

    # --------------------------------------------------------
    # 5-second candles
    # --------------------------------------------------------

    if seconds == 5:

        return source

    # --------------------------------------------------------
    # Aggregate 5s -> 10s / 30s
    # --------------------------------------------------------

    interval_ms = seconds * 1000

    result = []

    for candle in source:

        bucket = (
            candle["time_ms"]
            // interval_ms
        ) * interval_ms

        if (
            result
            and result[-1]["time_ms"] == bucket
        ):

            target = result[-1]

            target["high"] = max(
                target["high"],
                candle["high"],
            )

            target["low"] = min(
                target["low"],
                candle["low"],
            )

            target["close"] = candle[
                "close"
            ]

            target["volume"] += candle[
                "volume"
            ]

        else:

            result.append(
                {
                    "time_ms": bucket,
                    "time": timestamp_to_ist(
                        bucket
                    ),
                    "open": candle["open"],
                    "high": candle["high"],
                    "low": candle["low"],
                    "close": candle["close"],
                    "volume": candle["volume"],
                }
            )

    return result


# ============================================================
# LOAD STOCK UNIVERSE
# ============================================================

async def load_stock_universe():

    global STOCKS, STOCK_NAMES

    instrument_url = (
        "https://assets.upstox.com/"
        "market-quote/instruments/exchange/NSE.json.gz"
    )

    print()
    print(
        "Loading INVESTIQ NSE stock universe..."
    )

    try:

        async with httpx.AsyncClient(
            timeout=30
        ) as client:

            response = await client.get(
                instrument_url
            )

        response.raise_for_status()

        raw_json = gzip.decompress(
            response.content
        ).decode("utf-8")

        instruments = json.loads(
            raw_json
        )

        symbol_to_key: dict[str, str] = {}
        symbol_to_name: dict[str, str] = {}

        for instrument in instruments:

            if instrument.get(
                "segment"
            ) != "NSE_EQ":

                continue

            if instrument.get(
                "instrument_type"
            ) != "EQ":

                continue

            symbol = str(
                instrument.get(
                    "trading_symbol",
                    "",
                )
            ).upper()

            instrument_key = instrument.get(
                "instrument_key"
            )

            if (
                not symbol
                or not instrument_key
            ):

                continue

            symbol_to_key[
                symbol
            ] = instrument_key
            symbol_to_name[symbol] = str(
                instrument.get("name") or instrument.get("company_name") or symbol
            )

        resolved: dict[str, str] = {}
        resolved_names: dict[str, str] = {}

        missing: list[str] = []

        for symbol in STOCK_SYMBOLS:

            instrument_key = (
                symbol_to_key.get(
                    symbol.upper()
                )
            )

            if instrument_key:

                resolved[
                    symbol
                ] = instrument_key
                resolved_names[symbol] = symbol_to_name.get(symbol, symbol)

            else:

                missing.append(
                    symbol
                )

        STOCKS = resolved
        STOCK_NAMES = resolved_names

        print(
            f"Loaded {len(STOCKS)} / "
            f"{len(STOCK_SYMBOLS)} INVESTIQ stocks."
        )

        if missing:

            print()

            print(
                "Stocks not found in Upstox instrument master:"
            )

            print(
                ", ".join(missing)
            )

    except Exception as error:

        print()

        print(
            "Failed to load NSE instrument universe:"
        )

        print(error)

        raise RuntimeError(
            "Unable to load the INVESTIQ stock universe."
        )


# ============================================================
# SYMBOL HELPERS
# ============================================================

def normalize_instrument_key(
    instrument_key: str,
) -> str:

    return str(
        instrument_key
    ).replace(
        ":",
        "|",
    )


def get_symbol_from_instrument_key(
    instrument_key: str,
) -> str:

    normalized = (
        normalize_instrument_key(
            instrument_key
        )
    )

    for symbol, key in STOCKS.items():

        if (
            normalize_instrument_key(
                key
            )
            == normalized
        ):

            return symbol

    return instrument_key


# ============================================================
# STOCK DATA BUILDER
# ============================================================

def build_stock_data(
    symbol: str,
    price: float,
    previous_close: float,
    ltq: int = 0,
    timestamp=None,
):

    change = (
        price
        - previous_close
    )

    change_percent = (
        (
            change
            / previous_close
        )
        * 100
        if previous_close
        else 0.0
    )

    return {
        "symbol": symbol,
        "instrument_key": STOCKS.get(
            symbol,
            "",
        ),
        "price": float(price),
        "previous_close": float(
            previous_close
        ),
        "change": float(change),
        "change_percent": float(
            change_percent
        ),
        "ltq": int(ltq),
        "timestamp": timestamp,
    }


# ============================================================
# UPSTOX REST MARKET DATA
# ============================================================

async def update_latest_from_rest():

    global latest_prices, last_quote_refresh, market_data_message

    refresh_time = datetime.now(tz=IST)
    session_open = refresh_time.weekday() < 5 and (9, 15) <= (refresh_time.hour, refresh_time.minute) < (15, 30)
    if not session_open:
        for cached_quote in latest_prices.values():
            if cached_quote.get("source") in {"upstox", "upstox_websocket"}:
                cached_quote["source"] = "last_close"

    if not STOCKS:

        print(
            "No stocks available for market quote refresh."
        )

        market_data_message = "The NSE instrument list could not be loaded."
        return

    access_token = os.getenv(
        "UPSTOX_ACCESS_TOKEN"
    )

    if not access_token:

        print(
            "UPSTOX_ACCESS_TOKEN is missing."
        )

        last_quote_refresh = datetime.now(tz=IST)
        market_data_message = "Add a current Upstox access token to the API deployment to load market prices."
        return

    headers = {
        "Accept": "application/json",
        "Authorization": (
            f"Bearer {access_token}"
        ),
    }

    symbols = list(STOCKS.keys())
    instrument_keys = [STOCKS[symbol] for symbol in symbols]
    print(f"Fetching Upstox full market quotes for {len(symbols)} INVESTIQ stocks...")

    try:

        async with httpx.AsyncClient(
            timeout=30
        ) as client:

            if not instrument_keys:
                return

            response = await client.get(
                "https://api.upstox.com/v3/market-quote/quotes",
                headers=headers,
                params={"instrument_key": ",".join(instrument_keys)},
            )

            if response.status_code != 200:
                print(f"Upstox full quote request failed: HTTP {response.status_code}")
                last_quote_refresh = datetime.now(tz=IST)
                market_data_message = (
                    "Upstox rejected the access token. Refresh UPSTOX_ACCESS_TOKEN in Vercel."
                    if response.status_code in (401, 403)
                    else "Upstox could not provide a market snapshot. Try refreshing shortly."
                )
                return

            payload = response.json()
            data = payload.get("data", {})
            if not isinstance(data, dict):
                last_quote_refresh = datetime.now(tz=IST)
                return

            now = datetime.now(tz=IST)
            market_open = now.weekday() < 5 and (9, 15) <= (now.hour, now.minute) < (15, 30)
            updated_count = 0
            for response_key, quote in data.items():
                if not isinstance(quote, dict):
                    continue
                instrument_key = quote.get("instrument_token") or response_key
                symbol = get_symbol_from_instrument_key(instrument_key)
                if symbol not in STOCKS:
                    continue

                try:
                    last_price = float(quote.get("last_price") or 0)
                    previous_close = float(quote.get("prev_close_price") or quote.get("ohlc", {}).get("close") or last_price)
                except (TypeError, ValueError):
                    continue
                if last_price <= 0:
                    continue

                raw_trade_time = quote.get("last_trade_time")
                timestamp = None
                try:
                    if raw_trade_time:
                        timestamp = timestamp_to_ist(int(raw_trade_time))
                except (TypeError, ValueError, OverflowError):
                    pass

                stock_data = build_stock_data(
                    symbol=symbol,
                    price=last_price,
                    previous_close=previous_close if previous_close > 0 else last_price,
                    ltq=int(quote.get("ltq") or 0),
                    timestamp=timestamp,
                )
                stock_data["source"] = "upstox" if market_open else "last_close"
                stock_data["volume"] = int(quote.get("volume") or 0)
                latest_prices[symbol] = stock_data
                updated_count += 1

            print(f"Loaded actual last-traded prices for {updated_count} stocks.")
            last_quote_refresh = now
            market_data_message = None if updated_count else "Upstox returned no last-traded prices for this list."

        print()

        print(
            "Market price refresh complete: "
            f"{len(latest_prices)} stocks available."
        )

    except Exception as error:

        print(
            "Failed to refresh Upstox market prices:"
        )

        print(error)
        market_data_message = "The Upstox market feed could not be reached. Try again shortly."

    if last_quote_refresh is None:
        last_quote_refresh = datetime.now(tz=IST)


# ============================================================
# BROADCAST MARKET DATA
# ============================================================

async def broadcast_latest():

    if not clients:
        return

    payload = {
        "type": "market_update",
        "stocks": list(
            latest_prices.values()
        ),
    }

    disconnected = set()

    for websocket in list(
        clients
    ):

        try:

            await websocket.send_json(
                payload
            )

        except Exception:

            disconnected.add(
                websocket
            )

    for websocket in disconnected:

        clients.discard(
            websocket
        )


# ============================================================
# UPSTOX WEBSOCKET CALLBACKS
# ============================================================

def on_open():

    print()

    print(
        "Connected to Upstox WebSocket."
    )

    print(
        f"Subscribing to "
        f"{len(STOCKS)} market instruments..."
    )

    try:

        streamer.subscribe(
            list(
                STOCKS.values()
            ),
            "ltpc",
        )

        print(
            f"Subscribed to "
            f"{len(STOCKS)} stocks."
        )

    except Exception as error:

        print(
            "Subscription error:"
        )

        print(error)


def extract_timestamp_ms(
    ltpc: dict,
    message: dict,
) -> int | None:
    """
    Get the most appropriate timestamp from
    the Upstox feed.

    Priority:
        1. LTPC timestamp
        2. message currentTs
        3. current local time
    """

    possible_values = [
        ltpc.get("timestamp"),
        ltpc.get("ts"),
        message.get("currentTs"),
    ]

    for value in possible_values:

        if value is None:
            continue

        try:

            timestamp_ms = int(
                value
            )

            # Handle accidental seconds timestamp.
            if timestamp_ms < 10_000_000_000:

                timestamp_ms *= 1000

            return timestamp_ms

        except (
            TypeError,
            ValueError,
        ):

            continue

    return int(
        datetime.now(
            tz=timezone.utc
        ).timestamp()
        * 1000
    )


def on_message(message):

    global main_loop

    if not isinstance(
        message,
        dict,
    ):

        return

    feeds = message.get(
        "feeds",
        {},
    )

    if not feeds:
        return

    updates = []

    for (
        instrument_key,
        feed,
    ) in feeds.items():

        if not isinstance(
            feed,
            dict,
        ):

            continue

        ltpc = feed.get(
            "ltpc"
        )

        if not isinstance(
            ltpc,
            dict,
        ):

            continue

        symbol = (
            get_symbol_from_instrument_key(
                instrument_key
            )
        )

        if symbol not in STOCKS:
            continue

        try:

            price = float(
                ltpc.get(
                    "ltp",
                    0,
                )
            )

            previous_close = float(
                ltpc.get(
                    "cp",
                    0,
                )
            )

            ltq = int(
                ltpc.get(
                    "ltq",
                    0,
                )
                or 0
            )

        except (
            TypeError,
            ValueError,
        ):

            continue

        if price <= 0:
            continue

        if previous_close <= 0:
            previous_close = price

        timestamp_ms = (
            extract_timestamp_ms(
                ltpc,
                message,
            )
        )

        stock_data = (
            build_stock_data(
                symbol=symbol,
                price=price,
                previous_close=previous_close,
                ltq=ltq,
                timestamp=timestamp_ms,
            )
        )
        stock_data["source"] = "upstox_websocket"

        latest_prices[
            symbol
        ] = stock_data

        # ----------------------------------------------------
        # REAL 5-SECOND CANDLE
        # ----------------------------------------------------

        if timestamp_ms is not None:

            try:

                update_live_5s_candle(
                    symbol=symbol,
                    price=price,
                    volume=ltq,
                    timestamp_ms=timestamp_ms,
                )

            except Exception as error:

                print(
                    f"Live candle update error "
                    f"for {symbol}: {error}"
                )

        updates.append(
            stock_data
        )

    if not updates:
        return

    if main_loop is not None:

        try:

            asyncio.run_coroutine_threadsafe(
                broadcast_latest(),
                main_loop,
            )

        except Exception as error:

            print(
                "Broadcast scheduling error:"
            )

            print(error)


def on_error(error):

    print(
        "UPSTOX WEBSOCKET ERROR:"
    )

    print(error)


def on_close():

    print(
        "Upstox WebSocket connection closed."
    )


# ============================================================
# START UPSTOX WEBSOCKET
# ============================================================

def start_upstox_stream():

    global streamer

    access_token = os.getenv(
        "UPSTOX_ACCESS_TOKEN"
    )

    if not access_token:

        print(
            "UPSTOX_ACCESS_TOKEN is not configured."
        )

        return

    try:

        configuration = (
            upstox_client.Configuration()
        )

        configuration.access_token = (
            access_token
        )

        api_client = (
            upstox_client.ApiClient(
                configuration
            )
        )

        streamer = (
            upstox_client.MarketDataStreamerV3(
                api_client
            )
        )

        streamer.on(
            "open",
            on_open,
        )

        streamer.on(
            "message",
            on_message,
        )

        streamer.on(
            "error",
            on_error,
        )

        streamer.on(
            "close",
            on_close,
        )

        print()

        print(
            "Starting INVESTIQ live market streamer..."
        )

        streamer.connect()

    except Exception as error:

        print(
            "Failed to start Upstox streamer:"
        )

        print(error)


# ============================================================
# STARTUP
# ============================================================

@app.on_event("startup")
async def startup_event():

    global main_loop

    main_loop = (
        asyncio.get_running_loop()
    )

    print()

    print(
        "============================================"
    )

    print(
        "INVESTIQ backend starting..."
    )

    print(
        "============================================"
    )

    # 1. Resolve all stock symbols.
    await load_stock_universe()

    # 2. Initialize real live candle buffers.
    initialize_live_candle_buffers()

    # 3. Fetch real Upstox market prices.
    await update_latest_from_rest()

    # 4. Start WebSocket.
    asyncio.create_task(
        asyncio.to_thread(
            start_upstox_stream
        )
    )


# ============================================================
# ROOT
# ============================================================

@app.get("/")
async def root():

    return {
        "name": "INVESTIQ",
        "status": "online",
        "version": "1.5.0",
        "message": (
            "INVESTIQ backend is running"
        ),
        "stocks_loaded": len(
            STOCKS
        ),
        "market_data_available": len(
            latest_prices
        ),
        "live_candle_buffer": True,
        "live_candle_source": (
            "upstox_websocket"
        ),
    }


# ============================================================
# HEALTH
# ============================================================

@app.get("/health")
async def health():

    return {
        "status": "healthy",
        "service": "INVESTIQ API",
        "stocks_loaded": len(
            STOCKS
        ),
        "market_data_available": len(
            latest_prices
        ),
        "live_candle_buffer": True,
    }


# ============================================================
# MARKET LTP
# ============================================================

@app.get("/market/ltp")
async def get_ltp(
    instrument_key: str,
):

    access_token = os.getenv(
        "UPSTOX_ACCESS_TOKEN"
    )

    if not access_token:

        raise HTTPException(
            status_code=500,
            detail=(
                "UPSTOX_ACCESS_TOKEN "
                "is not configured"
            ),
        )

    url = (
        "https://api.upstox.com/"
        "v3/market-quote/ltp"
    )

    headers = {
        "Accept": "application/json",
        "Authorization": (
            f"Bearer {access_token}"
        ),
    }

    params = {
        "instrument_key": instrument_key
    }

    async with httpx.AsyncClient(
        timeout=10
    ) as client:

        response = await client.get(
            url,
            headers=headers,
            params=params,
        )

    if response.status_code != 200:

        raise HTTPException(
            status_code=response.status_code,
            detail=response.text,
        )

    return response.json()


# ============================================================
# MARKET OVERVIEW
# ============================================================

@app.get("/market/overview")
async def market_overview():
    if not STOCKS:
        await load_stock_universe()
    if last_quote_refresh is None or (datetime.now(tz=IST) - last_quote_refresh).total_seconds() >= 60:
        await update_latest_from_rest()

    available_prices = {
        symbol: quote
        for symbol, quote in latest_prices.items()
        if isinstance(quote, dict)
        and float(quote.get("price") or 0) > 0
        and quote.get("source") in {"upstox", "last_close", "upstox_websocket"}
    }
    source = "live" if any(quote.get("source") in {"upstox", "upstox_websocket"} for quote in available_prices.values()) else "last_close"
    if not available_prices:
        source = "unavailable"
    return {
        "status": "success",
        "source": source,
        "count": len(available_prices),
        "stocks": available_prices,
    }


@app.get("/market/universe")
async def market_universe():
    """Return every supported instrument, including rows without a quote."""
    if not STOCKS:
        try:
            await load_stock_universe()
        except RuntimeError as error:
            print(f"Using configured symbol list while instrument master is unavailable: {error}")
    if last_quote_refresh is None or (datetime.now(tz=IST) - last_quote_refresh).total_seconds() >= 60:
        await update_latest_from_rest()

    stocks = {}
    universe = STOCKS or {symbol: "" for symbol in STOCK_SYMBOLS}
    for symbol, instrument_key in universe.items():
        quote = latest_prices.get(symbol, {})
        valid_quote = (
            isinstance(quote, dict)
            and float(quote.get("price") or 0) > 0
            and quote.get("source") in {"upstox", "last_close", "upstox_websocket"}
        )
        stocks[symbol] = {
            "symbol": symbol,
            "name": STOCK_NAMES.get(symbol, symbol),
            "instrument_key": instrument_key,
            "price": quote.get("price", 0) if valid_quote else 0,
            "previous_close": quote.get("previous_close", 0) if valid_quote else 0,
            "change": quote.get("change", 0) if valid_quote else 0,
            "change_percent": quote.get("change_percent", 0) if valid_quote else 0,
            "ltq": quote.get("ltq", 0) if valid_quote else 0,
            "volume": quote.get("volume", 0) if valid_quote else 0,
            "timestamp": quote.get("timestamp") if valid_quote else None,
            "source": quote.get("source", "unavailable") if valid_quote else "unavailable",
            "quote_available": bool(valid_quote),
        }

    return {
        "status": "success",
        "source": "live" if any(row["source"] in {"upstox", "upstox_websocket"} for row in stocks.values()) else "last_close" if any(row["quote_available"] for row in stocks.values()) else "unavailable",
        "count": len(stocks),
        "quoted_count": sum(1 for row in stocks.values() if row["quote_available"]),
        "message": market_data_message,
        "stocks": stocks,
    }


@app.get("/market/quote/{symbol}")
async def market_quote(symbol: str):
    """Return an actual current or last-traded Upstox price."""
    symbol = symbol.upper().strip()

    if not STOCKS:
        await load_stock_universe()

    instrument_key = STOCKS.get(symbol)
    if not instrument_key:
        raise HTTPException(
            status_code=404,
            detail=f"{symbol} is not in the supported NSE stock list.",
        )

    if last_quote_refresh is None or (datetime.now(tz=IST) - last_quote_refresh).total_seconds() >= 60:
        await update_latest_from_rest()
    quote = latest_prices.get(symbol)
    if isinstance(quote, dict) and quote.get("source") in {"upstox", "last_close", "upstox_websocket"} and float(quote.get("price") or 0) > 0:
        return {**quote, "name": STOCK_NAMES.get(symbol, symbol)}

    if not os.getenv("UPSTOX_ACCESS_TOKEN"):
        raise HTTPException(status_code=503, detail="Upstox market data is not configured for this deployment.")
    raise HTTPException(status_code=404, detail=f"Upstox has no last-traded price for {symbol}.")


# ============================================================
# HISTORICAL CANDLES
# ============================================================

@app.get("/market/candles/{symbol}")
async def get_candles(
    symbol: str,
    timeframe: str = "1d",
):

    symbol = symbol.upper()
    timeframe = timeframe.lower()

    if symbol not in STOCKS:

        raise HTTPException(
            status_code=404,
            detail=(
                f"Stock '{symbol}' "
                "is not supported."
            ),
        )

    access_token = os.getenv(
        "UPSTOX_ACCESS_TOKEN"
    )

    if not access_token:

        raise HTTPException(
            status_code=500,
            detail=(
                "UPSTOX_ACCESS_TOKEN "
                "is not configured"
            ),
        )

    timeframe_map = {

        "1m": (
            "minutes",
            "1",
            31,
        ),

        "5m": (
            "minutes",
            "5",
            31,
        ),

        "15m": (
            "minutes",
            "15",
            31,
        ),

        "30m": (
            "minutes",
            "30",
            90,
        ),

        "1h": (
            "hours",
            "1",
            90,
        ),

        "4h": (
            "hours",
            "4",
            90,
        ),

        "1d": (
            "minutes",
            "5",
            1,
        ),

        "1w": (
            "days",
            "1",
            7,
        ),

        "1mo": (
            "days",
            "1",
            31,
        ),

        "3mo": (
            "days",
            "1",
            92,
        ),

        "6mo": (
            "days",
            "1",
            184,
        ),

        "1y": (
            "days",
            "1",
            365,
        ),

        "max": (
            "months",
            "1",
            None,
        ),
    }

    if timeframe not in timeframe_map:

        raise HTTPException(
            status_code=400,
            detail=(
                "Invalid timeframe. Use "
                "1m, 5m, 15m, 30m, 1h, 4h, "
                "1d, 1w, 1mo, 3mo, 6mo, 1y or max."
            ),
        )

    (
        unit,
        interval,
        days_back,
    ) = timeframe_map[
        timeframe
    ]

    today = datetime.now(
        tz=IST
    ).date()

    to_date = today

    if timeframe == "max":

        from_date = datetime(
            2000,
            1,
            1,
        ).date()

    else:

        from_date = (
            today
            - timedelta(
                days=days_back
            )
        )

    instrument_key = STOCKS[
        symbol
    ]

    if timeframe == "1d":
        url = (
            "https://api.upstox.com/v3/historical-candle/intraday/"
            f"{quote(instrument_key, safe='')}/minutes/5"
        )
    else:
        url = (
            "https://api.upstox.com/v3/"
            "historical-candle/"
            f"{quote(instrument_key, safe='')}/"
            f"{unit}/"
            f"{interval}/"
            f"{to_date.isoformat()}/"
            f"{from_date.isoformat()}"
        )

    headers = {
        "Accept": "application/json",
        "Authorization": (
            f"Bearer {access_token}"
        ),
    }

    try:

        async with httpx.AsyncClient(
            timeout=20
        ) as client:

            response = await client.get(
                url,
                headers=headers,
            )

    except Exception as error:

        raise HTTPException(
            status_code=502,
            detail=(
                "Market data request failed: "
                f"{str(error)}"
            ),
        )

    if response.status_code != 200:

        raise HTTPException(
            status_code=response.status_code,
            detail=response.text,
        )

    raw_data = response.json()

    candles = (
        raw_data
        .get("data", {})
        .get("candles", [])
    )

    formatted = []

    for candle in candles:

        if len(candle) < 6:
            continue

        try:

            formatted.append(
                {
                    "time": candle[0],
                    "open": float(
                        candle[1]
                    ),
                    "high": float(
                        candle[2]
                    ),
                    "low": float(
                        candle[3]
                    ),
                    "close": float(
                        candle[4]
                    ),
                    "volume": int(
                        candle[5]
                    ),
                }
            )

        except (
            TypeError,
            ValueError,
        ):

            continue

    formatted.reverse()

    return {
        "status": "success",
        "source": "upstox",
        "symbol": symbol,
        "timeframe": timeframe,
        "unit": unit,
        "interval": interval,
        "candles": formatted,
        "count": len(
            formatted
        ),
    }


# ============================================================
# REAL LIVE 5s / 10s / 30s CANDLES
# ============================================================

@app.get("/market/live-candles/{symbol}")
async def get_live_candles(
    symbol: str,
    timeframe: str = "5s",
):

    symbol = symbol.upper()
    timeframe = timeframe.lower()

    if symbol not in STOCKS:

        raise HTTPException(
            status_code=404,
            detail=(
                f"Stock '{symbol}' "
                "is not supported."
            ),
        )

    timeframe_seconds = {
        "5s": 5,
        "10s": 10,
        "30s": 30,
    }

    if timeframe not in timeframe_seconds:

        raise HTTPException(
            status_code=400,
            detail=(
                "Invalid live timeframe. "
                "Use 5s, 10s or 30s."
            ),
        )

    seconds = (
        timeframe_seconds[
            timeframe
        ]
    )

    candles = (
        aggregate_live_candles(
            symbol=symbol,
            seconds=seconds,
        )
    )

    return {
        "status": "success",
        "source": "upstox_websocket",
        "symbol": symbol,
        "timeframe": timeframe,
        "candles": candles,
        "count": len(candles),
        "live": True,
        "historical_5s_data": False,
        "buffer_limit": LIVE_CANDLE_LIMIT,
    }


# ============================================================
# LIVE CANDLE STATUS
# ============================================================

@app.get("/market/live-candle-status")
async def live_candle_status():

    available = {}

    with live_candle_lock:

        for symbol, candles in (
            live_candles.items()
        ):

            available[
                symbol
            ] = {
                "candles_5s": len(
                    candles
                ),
                "approx_minutes": round(
                    len(candles)
                    * 5
                    / 60,
                    2,
                ),
            }

    return {
        "status": "success",
        "source": "upstox_websocket",
        "max_5s_candles": (
            LIVE_CANDLE_LIMIT
        ),
        "stocks": available,
    }


# ============================================================
# AI SCORE
# ============================================================

@app.get("/ai/score/{symbol}")
async def get_ai_score(
    symbol: str,
):

    symbol = symbol.upper()

    if last_quote_refresh is None or (datetime.now(tz=IST) - last_quote_refresh).total_seconds() >= 60:
        await update_latest_from_rest()

    stock = latest_prices.get(symbol)
    if not isinstance(stock, dict) or stock.get("source") not in {"upstox", "last_close", "upstox_websocket"} or float(stock.get("price") or 0) <= 0:

        raise HTTPException(
            status_code=404,
            detail=(
                f"No market data available "
                f"for '{symbol}'."
            ),
        )

    ai_result = calculate_score(
        price=float(
            stock["price"]
        ),
        previous_close=float(
            stock["previous_close"]
        ),
        change_percent=float(
            stock["change_percent"]
        ),
    )

    return {
        "status": "success",
        "source": "last_close" if stock.get("source") == "last_close" else "upstox",
        "symbol": symbol,
        "price": stock["price"],
        "previous_close": stock[
            "previous_close"
        ],
        "change_percent": stock[
            "change_percent"
        ],
        "ai": ai_result,
    }


# ============================================================
# AI SCORES — ALL STOCKS
# ============================================================

@app.get("/ai/scores")
async def get_ai_scores():
    if last_quote_refresh is None or (datetime.now(tz=IST) - last_quote_refresh).total_seconds() >= 60:
        await update_latest_from_rest()

    market_prices = {
        symbol: stock
        for symbol, stock in latest_prices.items()
        if isinstance(stock, dict)
        and float(stock.get("price") or 0) > 0
        and stock.get("source") in {"upstox", "last_close", "upstox_websocket"}
    }

    results = {}

    for symbol, stock in market_prices.items():

        ai_result = calculate_score(
            price=float(
                stock["price"]
            ),
            previous_close=float(
                stock["previous_close"]
            ),
            change_percent=float(
                stock["change_percent"]
            ),
        )

        results[
            symbol
        ] = {
            "symbol": symbol,
            "instrument_key": stock.get(
                "instrument_key",
                "",
            ),
            "price": stock[
                "price"
            ],
            "previous_close": stock[
                "previous_close"
            ],
            "change": stock[
                "change"
            ],
            "change_percent": stock[
                "change_percent"
            ],
            "ltq": stock.get(
                "ltq",
                0,
            ),
            "timestamp": stock.get(
                "timestamp"
            ),
            **ai_result,
        }

    return {
        "status": "success",
        "source": "live" if any(stock.get("source") in {"upstox", "upstox_websocket"} for stock in market_prices.values()) else "last_close" if market_prices else "unavailable",
        "count": len(results),
        "stocks": results,
    }


# ============================================================
# MARKET STOCK LIST
# ============================================================

@app.get("/market/stocks")
async def market_stocks():

    return {
        "status": "success",
        "count": len(STOCK_SYMBOLS),
        "stocks": STOCK_SYMBOLS,
    }


# ============================================================
# MARKET STATUS
# ============================================================

@app.get("/market/status")
async def market_status():

    return {
        "status": "success",
        "websocket_connected": (
            streamer is not None
        ),
        "stocks_loaded": len(
            STOCKS
        ),
        "market_data_available": len(
            latest_prices
        ),
        "live_candle_buffer": True,
        "live_candle_limit": (
            LIVE_CANDLE_LIMIT
        ),
        "live_candle_stocks": len(
            live_candles
        ),
    }


# ============================================================
# LIVE MARKET WEBSOCKET
# ============================================================

@app.websocket("/ws/market")
async def market_websocket(
    websocket: WebSocket,
):

    await websocket.accept()

    clients.add(
        websocket
    )

    print(
        "Frontend WebSocket connected."
    )

    try:

        # Immediately send current market data.
        if latest_prices:

            await websocket.send_json(
                {
                    "type": "market_update",
                    "stocks": list(
                        latest_prices.values()
                    ),
                }
            )

        while True:

            # Keep frontend connection alive.
            await websocket.receive_text()

    except WebSocketDisconnect:

        pass

    except Exception as error:

        print(
            "Frontend WebSocket error:"
        )

        print(error)

    finally:

        clients.discard(
            websocket
        )

        print(
            "Frontend WebSocket disconnected."
        )
