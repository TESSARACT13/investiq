import asyncio
import os
from typing import Set

import httpx
import upstox_client
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

app = FastAPI(
    title="INVESTIQ API",
    description="Real-time AI investment and paper trading backend",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

STOCKS = {
    "RELIANCE": "NSE_EQ|INE002A01018",
    "TCS": "NSE_EQ|INE467B01029",
    "INFY": "NSE_EQ|INE009A01021",
    "HDFCBANK": "NSE_EQ|INE040A01034",
}

clients: Set[WebSocket] = set()

streamer = None

main_loop = None

latest_prices = {}


def process_market_message(message):
    global latest_prices

    feeds = message.get("feeds", {})

    if not feeds:
        return

    for instrument_key, feed in feeds.items():

        ltpc = feed.get("ltpc")

        if not ltpc:
            continue

        symbol = next(
            (
                name
                for name, key in STOCKS.items()
                if key == instrument_key
            ),
            instrument_key,
        )

        price = float(
            ltpc.get("ltp", 0)
        )

        previous_close = float(
            ltpc.get("cp", 0)
        )

        change = (
            price - previous_close
        )

        change_percent = (
            (change / previous_close) * 100
            if previous_close
            else 0
        )

        latest_prices[symbol] = {
            "symbol": symbol,
            "instrument_key": instrument_key,
            "price": price,
            "previous_close": previous_close,
            "change": change,
            "change_percent": change_percent,
            "ltq": int(
                ltpc.get("ltq", 0)
            ),
            "timestamp": message.get(
                "currentTs"
            ),
        }


async def broadcast_latest():
    if not latest_prices:
        return

    payload = {
        "type": "market_update",
        "stocks": list(
            latest_prices.values()
        ),
    }

    disconnected = set()

    for client in clients:

        try:
            await client.send_json(
                payload
            )

        except Exception:
            disconnected.add(client)

    for client in disconnected:
        clients.discard(client)


def on_open():
    print(
        "Connected to Upstox WebSocket."
    )

    print(
        "Subscribing to market instruments..."
    )

    streamer.subscribe(
        list(STOCKS.values()),
        "ltpc",
    )


def on_message(message):
    print(
        "LIVE MARKET UPDATE:"
    )

    print(message)

    process_market_message(
        message
    )

    if main_loop:

        asyncio.run_coroutine_threadsafe(
            broadcast_latest(),
            main_loop,
        )


def on_error(error):
    print(
        "UPSTOX WEBSOCKET ERROR:"
    )

    print(error)


def on_close():
    print(
        "Upstox WebSocket connection closed."
    )


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
        on_open
    )

    streamer.on(
        "message",
        on_message
    )

    streamer.on(
        "error",
        on_error
    )

    streamer.on(
        "close",
        on_close
    )

    print(
        "Starting INVESTIQ live market streamer..."
    )

    streamer.connect()


@app.on_event("startup")
async def startup_event():

    global main_loop

    main_loop = asyncio.get_running_loop()

    asyncio.create_task(
        asyncio.to_thread(
            start_upstox_stream
        )
    )


@app.get("/")
def root():

    return {
        "name": "INVESTIQ",
        "status": "online",
        "message": "INVESTIQ backend is running",
    }


@app.get("/health")
def health():

    return {
        "status": "healthy"
    }


@app.get("/market/ltp")
async def get_ltp(
    instrument_key: str
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


@app.get("/market/overview")
async def market_overview():

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

    instrument_keys = ",".join(
        STOCKS.values()
    )

    params = {
        "instrument_key": instrument_keys
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

    raw_data = response.json()

    return {
        "status": "success",
        "stocks": raw_data.get(
            "data",
            {},
        ),
    }


@app.get("/market/status")
def market_status():

    return {
        "connected_clients": len(
            clients
        ),
        "upstox_stream": (
            streamer is not None
        ),
        "stocks": list(
            STOCKS.keys()
        ),
        "latest_prices": latest_prices,
    }


@app.websocket("/ws/market")
async def market_websocket(
    websocket: WebSocket
):

    await websocket.accept()

    clients.add(
        websocket
    )

    print(
        "INVESTIQ frontend connected "
        "to /ws/market"
    )

    # Send the latest snapshot immediately.
    if latest_prices:

        await websocket.send_json(
            {
                "type": "market_update",
                "stocks": list(
                    latest_prices.values()
                ),
            }
        )

    try:

        while True:

            await websocket.receive_text()

    except WebSocketDisconnect:

        clients.discard(
            websocket
        )

        print(
            "INVESTIQ frontend disconnected "
            "from /ws/market"
        )

    except Exception:

        clients.discard(
            websocket
        )
