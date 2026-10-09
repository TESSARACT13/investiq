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


# ============================================================
# GLOBAL STATE
# ============================================================

clients: Set[WebSocket] = set()

streamer = None

main_loop = None

latest_prices: dict[str, dict] = {}


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
# FALLBACK MARKET DATA
# ============================================================

FALLBACK_PRICES = {
    "RELIANCE": {
        "price": 1226.00,
        "previous_close": 1219.20,
    },
    "TCS": {
        "price": 2082.00,
        "previous_close": 2087.00,
    },
    "INFY": {
        "price": 1000.20,
        "previous_close": 1014.50,
    },
    "HDFCBANK": {
        "price": 735.60,
        "previous_close": 728.90,
    },
}


# ============================================================
# LOAD STOCK UNIVERSE
# ============================================================

async def load_stock_universe():

    global STOCKS

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

        resolved: dict[str, str] = {}

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

            else:

                missing.append(
                    symbol
                )

        STOCKS = resolved

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
# FALLBACK PRICES
# ============================================================

def apply_fallback_prices():

    for symbol, data in (
        FALLBACK_PRICES.items()
    ):

        if symbol in latest_prices:
            continue

        price = float(
            data["price"]
        )

        previous_close = float(
            data["previous_close"]
        )

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

        latest_prices[
            symbol
        ] = {
            "symbol": symbol,
            "instrument_key": STOCKS.get(
                symbol,
                "",
            ),
            "price": price,
            "previous_close": previous_close,
            "change": change,
            "change_percent": change_percent,
            "ltq": 0,
            "timestamp": None,
        }


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

    global latest_prices

    if not STOCKS:

        print(
            "No stocks available for market quote refresh."
        )

        return

    access_token = os.getenv(
        "UPSTOX_ACCESS_TOKEN"
    )

    if not access_token:

        print(
            "UPSTOX_ACCESS_TOKEN is missing."
        )

        return

    headers = {
        "Accept": "application/json",
        "Authorization": (
            f"Bearer {access_token}"
        ),
    }

    symbols = list(
        STOCKS.keys()
    )

    print()

    print(
        f"Fetching Upstox prices for "
        f"{len(symbols)} INVESTIQ stocks..."
    )

    try:

        async with httpx.AsyncClient(
            timeout=30
        ) as client:

            batch_size = 100

            for start in range(
                0,
                len(symbols),
                batch_size,
            ):

                batch_symbols = (
                    symbols[
                        start:
                        start + batch_size
                    ]
                )

                batch_keys = [
                    STOCKS[symbol]
                    for symbol in batch_symbols
                    if symbol in STOCKS
                ]

                if not batch_keys:
                    continue

                params = {
                    "instrument_key": ",".join(
                        batch_keys
                    )
                }

                response = await client.get(
                    "https://api.upstox.com/v3/market-quote/ltp",
                    headers=headers,
                    params=params,
                )

                if response.status_code != 200:

                    print(
                        "Upstox LTP request failed:"
                    )

                    print(
                        response.status_code
                    )

                    print(
                        response.text
                    )

                    continue

                payload = response.json()

                data = payload.get(
                    "data",
                    {},
                )

                if not isinstance(
                    data,
                    dict,
                ):

                    continue

                for (
                    instrument_key,
                    quote,
                ) in data.items():

                    if not isinstance(
                        quote,
                        dict,
                    ):

                        continue

                    last_price = quote.get(
                        "last_price"
                    )

                    if last_price is None:
                        continue

                    try:

                        last_price = float(
                            last_price
                        )

                    except (
                        TypeError,
                        ValueError,
                    ):

                        continue

                    if last_price <= 0:
                        continue

                    symbol = (
                        get_symbol_from_instrument_key(
                            instrument_key
                        )
                    )

                    if symbol not in STOCKS:
                        continue

                    previous_close = (
                        quote.get(
                            "cp"
                        )
                        or quote.get(
                            "previous_close"
                        )
                        or last_price
                    )

                    try:

                        previous_close = float(
                            previous_close
                        )

                    except (
                        TypeError,
                        ValueError,
                    ):

                        previous_close = (
                            last_price
                        )

                    if previous_close <= 0:

                        previous_close = (
                            last_price
                        )

                    stock_data = (
                        build_stock_data(
                            symbol=symbol,
                            price=last_price,
                            previous_close=previous_close,
                            ltq=int(
                                quote.get(
                                    "ltq",
                                    0,
                                )
                                or 0
                            ),
                            timestamp=(
                                datetime.now(
                                    tz=IST
                                ).isoformat()
                            ),
                        )
                    )

                    latest_prices[
                        symbol
                    ] = stock_data

                print(
                    "Loaded prices: "
                    f"{min(start + batch_size, len(symbols))}"
                    f"/{len(symbols)}"
                )

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

    apply_fallback_prices()


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

    # 3. Apply fallback prices.
    apply_fallback_prices()

    # 4. Fetch latest Upstox prices.
    await update_latest_from_rest()

    # 5. Start WebSocket.
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

    if not latest_prices:

        await update_latest_from_rest()

    apply_fallback_prices()

    return {
        "status": "success",
        "source": (
            "upstox"
            if len(latest_prices)
            > len(FALLBACK_PRICES)
            else "fallback"
        ),
        "count": len(
            latest_prices
        ),
        "stocks": latest_prices,
    }


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
            "days",
            "1",
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

    url = (
        "https://api.upstox.com/v3/"
        "historical-candle/"
        f"{instrument_key}/"
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

    if symbol not in latest_prices:

        await update_latest_from_rest()

    apply_fallback_prices()

    if symbol not in latest_prices:

        raise HTTPException(
            status_code=404,
            detail=(
                f"No market data available "
                f"for '{symbol}'."
            ),
        )

    stock = latest_prices[
        symbol
    ]

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
        "source": (
            "upstox"
            if stock.get("timestamp")
            else "fallback"
        ),
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

    if not latest_prices:

        await update_latest_from_rest()

    apply_fallback_prices()

    results = {}

    for symbol, stock in (
        latest_prices.items()
    ):

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
        "source": (
            "upstox"
            if any(stock.get("timestamp") for stock in latest_prices.values())
            else "fallback"
        ),
        "count": len(
            results
        ),
        "stocks": results,
    }


# ============================================================
# MARKET STOCK LIST
# ============================================================

@app.get("/market/stocks")
async def market_stocks():

    return {
        "status": "success",
        "count": len(
            STOCKS
        ),
        "stocks": list(
            STOCKS.keys()
        ),
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
