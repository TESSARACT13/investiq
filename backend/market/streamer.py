import os
import upstox_client
from dotenv import load_dotenv

load_dotenv()

ACCESS_TOKEN = os.getenv("UPSTOX_ACCESS_TOKEN")

INSTRUMENTS = [
    "NSE_EQ|INE002A01018",
    "NSE_EQ|INE467B01029",
    "NSE_EQ|INE009A01021",
    "NSE_EQ|INE040A01034",
]


def on_open():
    print("Connected to Upstox WebSocket.")
    print("Subscribing to market instruments...")

    streamer.subscribe(
        INSTRUMENTS,
        "ltpc"
    )


def on_message(message):
    print("LIVE MARKET UPDATE:")
    print(message)


def on_error(error):
    print("UPSTOX WEBSOCKET ERROR:")
    print(error)


def on_close():
    print("Upstox WebSocket connection closed.")


if not ACCESS_TOKEN:
    raise RuntimeError(
        "UPSTOX_ACCESS_TOKEN is not configured."
    )


configuration = upstox_client.Configuration()
configuration.access_token = ACCESS_TOKEN

api_client = upstox_client.ApiClient(configuration)

streamer = upstox_client.MarketDataStreamerV3(
    api_client
)

streamer.on("open", on_open)
streamer.on("message", on_message)
streamer.on("error", on_error)
streamer.on("close", on_close)


if __name__ == "__main__":
    print("Starting INVESTIQ live market streamer...")
    streamer.connect()
