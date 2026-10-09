"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useParams, useRouter } from "next/navigation";
import { API_URL, marketWebSocketUrl } from "@/lib/api";
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  Bell,
  CandlestickChart,
  ChevronDown,
  Clock3,
  LineChart,
  Loader2,
  Minus,
  RefreshCw,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";

type Timeframe =
  | "5s"
  | "10s"
  | "30s"
  | "1m"
  | "5m"
  | "15m"
  | "30m"
  | "1h"
  | "4h"
  | "1d"
  | "1w"
  | "1mo"
  | "3mo"
  | "6mo"
  | "1y"
  | "max";

const TIMEFRAMES: {
  label: string;
  value: Timeframe;
}[] = [
  { label: "5s", value: "5s" },
  { label: "10s", value: "10s" },
  { label: "30s", value: "30s" },
  { label: "1m", value: "1m" },
  { label: "5m", value: "5m" },
  { label: "15m", value: "15m" },
  { label: "30m", value: "30m" },
  { label: "1H", value: "1h" },
  { label: "4H", value: "4h" },
  { label: "1D", value: "1d" },
  { label: "1W", value: "1w" },
  { label: "1M", value: "1mo" },
  { label: "3M", value: "3mo" },
  { label: "6M", value: "6mo" },
  { label: "1Y", value: "1y" },
  { label: "MAX", value: "max" },
];

type ChartType =
  | "candlestick"
  | "line"
  | "area";

type StockData = {
  symbol: string;
  name: string;
  price: number;
  previous_close: number;
  change: number;
  change_percent: number;
  volume?: number;
  market_status?: string;
  timestamp?: string | number | null;
  source?: string;
};

type AIData = {
  score: number;
  signal:
    | "BUY"
    | "HOLD"
    | "SELL"
    | string;
  confidence: number;
  explanation: string;
};

type Candle = {
  time: number | string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

const FALLBACK_STOCKS: Record<
  string,
  StockData
> = {
  RELIANCE: {
    symbol: "RELIANCE",
    name: "Reliance Industries",
    price: 1226,
    previous_close: 1219.2,
    change: 6.8,
    change_percent: 0.56,
  },

  TCS: {
    symbol: "TCS",
    name: "Tata Consultancy Services",
    price: 2082,
    previous_close: 2087,
    change: -5,
    change_percent: -0.24,
  },

  INFY: {
    symbol: "INFY",
    name: "Infosys",
    price: 1000.2,
    previous_close: 1014.5,
    change: -14.3,
    change_percent: -1.41,
  },

  HDFCBANK: {
    symbol: "HDFCBANK",
    name: "HDFC Bank",
    price: 735.6,
    previous_close: 728.9,
    change: 6.7,
    change_percent: 0.92,
  },
};

function formatPrice(value: number) {
  return `₹${Number(
    value || 0
  ).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatCurrency(value: number) {
  return `₹${Number(
    value || 0
  ).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatOptionalPrice(value: number) {
  return Number.isFinite(value) && value > 0 ? formatPrice(value) : "—";
}

function formatNumber(value: number) {
  return Number(
    value || 0
  ).toLocaleString("en-IN");
}

function toDate(
  value: number | string
) {
  const numericValue =
    typeof value === "number"
      ? value
      : Number(value);

  if (Number.isFinite(numericValue)) {
    return new Date(
      numericValue < 10000000000
        ? numericValue * 1000
        : numericValue
    );
  }

  return new Date(value);
}

function formatXAxisTime(
  value: number | string,
  timeframe: Timeframe
) {
  const date = toDate(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  const longRange =
    timeframe === "1mo" ||
    timeframe === "3mo" ||
    timeframe === "6mo" ||
    timeframe === "1y" ||
    timeframe === "max";

  if (longRange) {
    return date.toLocaleDateString(
      "en-IN",
      {
        day: "2-digit",
        month: "short",
        year:
          timeframe === "1y" ||
          timeframe === "max"
            ? "2-digit"
            : undefined,
      }
    );
  }

  return date.toLocaleTimeString(
    "en-IN",
    {
      hour: "2-digit",
      minute: "2-digit",
      second:
        timeframe === "5s" ||
        timeframe === "10s" ||
        timeframe === "30s"
          ? "2-digit"
          : undefined,
    }
  );
}

function formatFullDate(
  value: number | string
) {
  const date = toDate(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString(
    "en-IN",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }
  );
}

function normalizeStock(
  data: any,
  symbol: string
): StockData {
  const fallback =
    FALLBACK_STOCKS[symbol] ?? {
      symbol,
      name: symbol,
      price: 0,
      previous_close: 0,
      change: 0,
      change_percent: 0,
    };

  const price = Number(
    data?.price ??
      data?.ltp ??
      data?.last_price ??
      fallback.price
  );

  const previousClose = Number(
    data?.previous_close ??
      data?.previousClose ??
      data?.prev_close ??
      fallback.previous_close
  );

  const rawChange =
    data?.change ??
    (price - previousClose);

  const change = Number(
    Number.isFinite(
      Number(rawChange)
    )
      ? rawChange
      : fallback.change
  );

  const rawChangePercent =
    data?.change_percent ??
    data?.changePercent ??
    (previousClose > 0
      ? ((price -
          previousClose) /
          previousClose) *
        100
      : fallback.change_percent);

  const changePercent = Number(
    Number.isFinite(
      Number(rawChangePercent)
    )
      ? rawChangePercent
      : fallback.change_percent
  );

  return {
    symbol: String(
      data?.symbol ?? symbol
    ).toUpperCase(),

    name:
      data?.name ??
      fallback.name,

    price,

    previous_close:
      previousClose,

    change,

    change_percent:
      changePercent,

    volume: Number(
      data?.volume ?? 0
    ),

    market_status:
      data?.market_status ??
      "CLOSED",
  };
}

function normalizeCandles(
  rawCandles: any[]
): Candle[] {
  return rawCandles
    .map((item: any) => ({
      time:
        item?.time ??
        item?.timestamp ??
        item?.date,

      open: Number(
        item?.open ?? 0
      ),

      high: Number(
        item?.high ?? 0
      ),

      low: Number(
        item?.low ?? 0
      ),

      close: Number(
        item?.close ??
          item?.price ??
          0
      ),

      volume: Number(
        item?.volume ?? 0
      ),
    }))
    .filter(
      (item: Candle) =>
        item.time !==
          undefined &&
        Number.isFinite(
          item.open
        ) &&
        Number.isFinite(
          item.high
        ) &&
        Number.isFinite(
          item.low
        ) &&
        Number.isFinite(
          item.close
        )
    )
    .sort((left, right) => toDate(left.time).getTime() - toDate(right.time).getTime());
}

export default function StockDetailsPage() {
  const params = useParams();
  const router = useRouter();

  const rawSymbol =
    params?.symbol;

  const symbol = String(
    Array.isArray(rawSymbol)
      ? rawSymbol[0]
      : rawSymbol ?? ""
  ).toUpperCase();

  const [stock, setStock] =
    useState<StockData | null>(
      () => {
        return (
          FALLBACK_STOCKS[
            symbol
          ] ?? {
            symbol,
            name: symbol,
            price: 0,
            previous_close: 0,
            change: 0,
            change_percent: 0,
            market_status:
              "LOADING",
          }
        );
      }
    );

  const [ai, setAi] =
    useState<AIData | null>(
      null
    );

  const [candles, setCandles] =
    useState<Candle[]>([]);
  const [chartNotice, setChartNotice] = useState("");

  const [loading, setLoading] =
    useState(true);

  const [chartLoading, setChartLoading] =
    useState(true);

  const [marketConnected, setMarketConnected] =
    useState(false);
  const [quoteStatus, setQuoteStatus] = useState<"loading" | "live" | "sample" | "unavailable">("loading");
  const [quoteMessage, setQuoteMessage] = useState("");

  const [quantity, setQuantity] =
    useState(1);

  const [orderSide, setOrderSide] =
    useState<"BUY" | "SELL">(
      "BUY"
    );

  const [chartType, setChartType] =
    useState<ChartType>(
      "candlestick"
    );

  const [showChartMenu, setShowChartMenu] =
    useState(false);

  const [refreshing, setRefreshing] =
    useState(false);

  const [timeframe, setTimeframe] =
    useState<Timeframe>("1d");

  const timeframeRef =
    useRef<Timeframe>("1d");

  const liveCandlesRef =
    useRef<Candle[]>([]);

  useEffect(() => {
    timeframeRef.current =
      timeframe;
  }, [timeframe]);

  useEffect(() => {
    const savedChartType =
      window.localStorage.getItem(
        "investiq_chart_type"
      ) as ChartType | null;

    if (
      savedChartType ===
        "candlestick" ||
      savedChartType === "line" ||
      savedChartType === "area"
    ) {
      setChartType(
        savedChartType
      );
    }
  }, []);

  useEffect(() => {
    if (!symbol) return;

    let cancelled = false;

    async function loadStock() {
      try {
        const response =
          await fetch(
            `${API_URL}/market/quote/${encodeURIComponent(symbol)}`,
            {
              cache: "no-store",
            }
          );

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(String(body?.detail || "Current price is unavailable."));
        }

        const data =
          await response.json();

        if (!cancelled) {
          setStock(normalizeStock(data, symbol));
          setQuoteStatus(data?.source === "sample" ? "sample" : "live");
          setQuoteMessage("");
        }
      } catch (error) {
        console.error(
          "Stock loading error:",
          error
        );

        if (!cancelled) {
          // Never replace a missing market quote with a stale demo price.
          setStock(null);
          setQuoteStatus("unavailable");
          setQuoteMessage(error instanceof Error ? error.message : "Current price is unavailable.");
        }
      }
    }

    loadStock();

    return () => {
      cancelled = true;
    };
  }, [symbol]);

  async function loadAI() {
    if (!symbol) return;

    try {
      const response =
        await fetch(
          `${API_URL}/ai/score/${symbol}`,
          {
            cache: "no-store",
          }
        );

      if (!response.ok) return;

      const data =
        await response.json();

      if (data?.source === "fallback") {
        setAi(null);
        return;
      }

      const result =
        data?.ai ?? data;

      setAi({
        score: Number(
          result?.score ?? 50
        ),

        signal: String(
          result?.signal ??
            "HOLD"
        ),

        confidence: Number(
          result?.signal_strength ??
            result?.confidence ??
            50
        ),

        explanation:
          result?.explanation ??
          "AI analysis is based on current market conditions.",
      });
    } catch {
      setAi(null);
    }
  }

  async function loadLiveCandles(
    selectedTimeframe: Timeframe
  ) {
    if (!symbol) return;

    setChartLoading(true);

    try {
      const response =
        await fetch(
          `${API_URL}/market/live-candles/${symbol}?timeframe=${selectedTimeframe}`,
          {
            cache: "no-store",
          }
        );

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setChartNotice(String(body?.detail || "Live candles are unavailable. Connect a market data feed."));
        setCandles([]);
        liveCandlesRef.current =
          [];
        return;
      }

      const data =
        await response.json();

      const rawCandles =
        Array.isArray(
          data?.candles
        )
          ? data.candles
          : [];

      const normalized =
        normalizeCandles(
          rawCandles
        );

      liveCandlesRef.current =
        normalized;

      setCandles(
        normalized
      );
      setChartNotice(normalized.length ? "" : "No live candles have arrived yet. Historical chart data is available when your market feed is connected.");
    } catch (error) {
      console.error(
        "Live candle loading error:",
        error
      );

      setCandles([]);
      liveCandlesRef.current =
        [];
    } finally {
      setChartLoading(false);
    }
  }

  async function loadHistoricalCandles(
    selectedTimeframe: Timeframe
  ) {
    if (!symbol) return;

    setChartLoading(true);

    try {
      const response =
        await fetch(
          `${API_URL}/market/candles/${symbol}?timeframe=${selectedTimeframe}`,
          {
            cache: "no-store",
          }
        );

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setChartNotice(String(body?.detail || "Historical prices are unavailable. Connect your Upstox market feed to load real candles."));
        setCandles([]);
        return;
      }

      const data =
        await response.json();

      const rawCandles =
        Array.isArray(data)
          ? data
          : Array.isArray(
              data?.candles
            )
            ? data.candles
            : [];

      const normalized = normalizeCandles(rawCandles);
      setCandles(normalized);
      setChartNotice(normalized.length ? "" : "No historical candles returned for this interval. Try another timeline or connect your Upstox market feed.");
    } catch (error) {
      console.error(
        "Chart loading error:",
        error
      );

      setCandles([]);
    } finally {
      setChartLoading(false);
    }
  }

  async function loadCandles(
    selectedTimeframe: Timeframe = timeframe
  ) {
    if (
      selectedTimeframe === "5s" ||
      selectedTimeframe === "10s" ||
      selectedTimeframe === "30s"
    ) {
      await loadLiveCandles(
        selectedTimeframe
      );

      return;
    }

    await loadHistoricalCandles(
      selectedTimeframe
    );
  }

  async function loadEverything() {
    setLoading(true);

    await Promise.all([
      loadAI(),
      loadCandles(
        timeframeRef.current
      ),
    ]);

    setLoading(false);
  }

  useEffect(() => {
    if (!symbol) return;

    loadEverything();
  }, [symbol]);

  function getSecondsFromTimeframe(
    value: Timeframe
  ) {
    if (value === "5s")
      return 5;

    if (value === "10s")
      return 10;

    if (value === "30s")
      return 30;

    return null;
  }

  function updateLiveCandle(
    price: number,
    timestamp?: number,
    volume?: number
  ) {
    const currentTimeframe =
      timeframeRef.current;

    const seconds =
      getSecondsFromTimeframe(
        currentTimeframe
      );

    if (
      !seconds ||
      !Number.isFinite(price)
    ) {
      return;
    }

    const timestampMs =
      timestamp &&
      Number.isFinite(timestamp)
        ? timestamp <
          10000000000
          ? timestamp * 1000
          : timestamp
        : Date.now();

    const intervalMs =
      seconds * 1000;

    const bucketTime =
      Math.floor(
        timestampMs /
          intervalMs
      ) * intervalMs;

    const existing =
      liveCandlesRef.current;

    const last =
      existing[
        existing.length - 1
      ];

    if (
      !last ||
      Number(last.time) !==
        bucketTime
    ) {
      const newCandle: Candle =
        {
          time: bucketTime,
          open: price,
          high: price,
          low: price,
          close: price,
          volume:
            volume ?? 0,
        };

      const next = [
        ...existing,
        newCandle,
      ].slice(-5000);

      liveCandlesRef.current =
        next;

      setCandles(next);

      return;
    }

    const updated: Candle = {
      ...last,

      high: Math.max(
        last.high,
        price
      ),

      low: Math.min(
        last.low,
        price
      ),

      close: price,

      volume:
        (last.volume ?? 0) +
        (volume ?? 0),
    };

    const next = [
      ...existing.slice(0, -1),
      updated,
    ];

    liveCandlesRef.current =
      next;

    setCandles(next);
  }

  useEffect(() => {
    if (!symbol) return;

    const websocket =
      new WebSocket(
        marketWebSocketUrl()
      );

    websocket.onopen = () => setMarketConnected(false);

    websocket.onmessage = (
      event
    ) => {
      try {
        const data =
          JSON.parse(
            event.data
          );

        const incomingStocks =
          Array.isArray(
            data?.stocks
          )
            ? data.stocks
            : [data];

        const incoming =
          incomingStocks.find(
            (item: any) =>
              String(
                item?.symbol ??
                  item?.tradingsymbol ??
                  ""
              ).toUpperCase() ===
              symbol
          );

        if (!incoming) return;
        const hasLiveTimestamp = Boolean(incoming?.timestamp ?? incoming?.ltt);

        const updatedPrice =
          Number(
            incoming?.price ??
              incoming?.ltp ??
              incoming?.last_price ??
              0
          );

        if (
          !Number.isFinite(
            updatedPrice
          ) ||
          updatedPrice <= 0
        ) {
          return;
        }

        setStock(
          (previous) => {
            const fallback =
              previous ??
              FALLBACK_STOCKS[
                symbol
              ] ?? {
                symbol,
                name: symbol,
                price: 0,
                previous_close: 0,
                change: 0,
                change_percent: 0,
              };

            const previousClose =
              Number(
                fallback.previous_close
              );

            return {
              ...fallback,

              price:
                updatedPrice,

              volume: Number(
                incoming?.volume ??
                  incoming?.ltq ??
                  fallback.volume ??
                  0
              ),

              change:
                updatedPrice -
                previousClose,

              change_percent:
                previousClose >
                0
                  ? ((updatedPrice -
                      previousClose) /
                      previousClose) *
                    100
                  : fallback.change_percent,
              timestamp: incoming?.timestamp ?? incoming?.ltt ?? fallback.timestamp,
              source: hasLiveTimestamp ? "upstox" : fallback.source,
            };
          }
        );

        if (hasLiveTimestamp) {
          setMarketConnected(true);
          setQuoteStatus("live");
          setQuoteMessage("");
        }

        updateLiveCandle(
          updatedPrice,
          Number(
            incoming?.timestamp ??
              incoming?.ltt ??
              Date.now()
          ),
          Number(
            incoming?.ltq ??
              incoming?.volume ??
              0
          )
        );
      } catch {
        // Ignore malformed WebSocket messages.
      }
    };

    websocket.onclose = () => {
      setMarketConnected(false);
    };

    websocket.onerror = () => {
      setMarketConnected(false);
    };

    return () => {
      websocket.close();
    };
  }, [symbol]);

  function changeChartType(
    type: ChartType
  ) {
    setChartType(type);

    window.localStorage.setItem(
      "investiq_chart_type",
      type
    );

    setShowChartMenu(false);
  }

  function handleTimeframeChange(
    nextTimeframe: Timeframe
  ) {
    setTimeframe(
      nextTimeframe
    );

    timeframeRef.current =
      nextTimeframe;

    loadCandles(
      nextTimeframe
    );
  }

  async function refreshPage() {
    setRefreshing(true);

    try {
      const response =
        await fetch(
          `${API_URL}/market/quote/${encodeURIComponent(symbol)}`,
          {
            cache: "no-store",
          }
        );

      if (response.ok) {
        const data =
          await response.json();

        setStock(normalizeStock(data, symbol));
        setQuoteStatus(data?.source === "sample" ? "sample" : "live");
        setQuoteMessage("");
      } else {
        const body = await response.json().catch(() => ({}));
        setQuoteStatus("unavailable");
        setQuoteMessage(String(body?.detail || "Current price is unavailable."));
      }
    } catch (error) {
      console.error(
        "Refresh error:",
        error
      );
    }

    await Promise.all([
      loadAI(),
      loadCandles(
        timeframeRef.current
      ),
    ]);

    setRefreshing(false);
  }

  const totalOrderValue =
    useMemo(() => {
      return (
        Number(
          stock?.price ?? 0
        ) * quantity
      );
    }, [
      stock?.price,
      quantity,
    ]);

  const scoreProgress =
    Math.max(
      0,
      Math.min(
        100,
        Number(
          ai?.score ?? 0
        )
      )
    );

  if (!stock) {
    return (
      <main className="stock-detail-page min-h-screen bg-[#05070d] text-white">
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-white/10 border-t-blue-400" />

            <p className="text-sm text-slate-400">
              Loading stock...
            </p>
          </div>
        </div>
      </main>
    );
  }

  const hasPrice = stock.price > 0;
  const isPositive =
    stock.change >= 0;

  const liveTimeframe =
    timeframe === "5s" ||
    timeframe === "10s" ||
    timeframe === "30s";

  return (
    <main className="stock-detail-page min-h-screen bg-[#05070d] text-white">
      <div className="mx-auto max-w-[1500px] px-4 pb-12 pt-5 sm:px-6 lg:px-8">
        {/* Header */}

        <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <button
              onClick={() =>
                router.back()
              }
              className="mb-4 text-sm text-slate-400 transition hover:text-white"
            >
              ← Back to Markets
            </button>

            <div className="flex flex-wrap items-center gap-3">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-3xl font-bold tracking-tight">
                    {stock.symbol}
                  </h1>

                  <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-xs text-slate-400">
                    NSE
                  </span>
                </div>

                <p className="mt-1 text-sm text-slate-400">
                  {stock.name}
                </p>
              </div>

              <div
                className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${
                  marketConnected
                    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                    : "border-slate-500/20 bg-slate-500/10 text-slate-400"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    marketConnected
                      ? "animate-pulse bg-emerald-400"
                      : "bg-slate-500"
                  }`}
                />

                {quoteStatus === "live" && marketConnected
                  ? "LIVE PRICE"
                  : quoteStatus === "live"
                    ? "LAST QUOTE"
                    : quoteStatus === "sample"
                      ? "SAMPLE PRICE"
                      : quoteStatus === "unavailable"
                        ? "PRICE UNAVAILABLE"
                        : "CHECKING PRICE"}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-slate-400 transition hover:bg-white/[0.06] hover:text-white"
              title="Price alert"
            >
              <Bell size={18} />
            </button>

            <button
              onClick={
                refreshPage
              }
              disabled={refreshing}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-300 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-50"
            >
              <RefreshCw
                size={17}
                className={
                  refreshing
                    ? "animate-spin"
                    : ""
                }
              />

              Refresh
            </button>
          </div>
        </header>

        {/* Price Hero */}

        <section className="mb-6 rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-5 shadow-2xl shadow-black/20">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex flex-wrap items-end gap-4">
                <span className="text-4xl font-bold tracking-tight sm:text-5xl">
                  {hasPrice
                    ? formatPrice(
                        stock.price
                      )
                    : quoteStatus === "loading" ? "Loading price…" : "Price unavailable"}
                </span>

                <span
                  className={`mb-1 flex items-center gap-1 text-base font-semibold ${
                    isPositive
                      ? "text-emerald-400"
                      : "text-red-400"
                  }`}
                >
                  {hasPrice && isPositive ? (
                    <ArrowUp
                      size={17}
                    />
                  ) : hasPrice ? (
                    <ArrowDown
                      size={17}
                    />
                  ) : null}

                  {hasPrice ? <>
                    {isPositive ? "+" : ""}{formatPrice(stock.change)} ({isPositive ? "+" : ""}{stock.change_percent.toFixed(2)}%)
                  </> : null}
                </span>
              </div>

              {!hasPrice && quoteStatus === "unavailable" && (
                <p className="mt-2 max-w-2xl text-sm text-slate-500">{quoteMessage || "No current quote is available for this stock."}</p>
              )}

              <p className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                <Clock3 size={13} />
                Previous close {stock.previous_close > 0 ? formatPrice(stock.previous_close) : "—"}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MetricCard
                label="Open"
                value={formatOptionalPrice(candles[0]?.open ?? (hasPrice ? stock.price : 0))}
              />

              <MetricCard
                label="High"
                value={formatOptionalPrice(
                  candles.length
                    ? Math.max(
                        ...candles.map(
                          (c) =>
                            c.high
                        )
                      )
                    : hasPrice ? stock.price : 0
                )}
              />

              <MetricCard
                label="Low"
                value={formatOptionalPrice(
                  candles.length
                    ? Math.min(
                        ...candles.map(
                          (c) =>
                            c.low
                        )
                      )
                    : hasPrice ? stock.price : 0
                )}
              />

              <MetricCard
                label="Volume"
                value={
                  stock.volume
                    ? formatNumber(
                        stock.volume
                      )
                    : "—"
                }
              />
            </div>
          </div>
        </section>

        {/* Main Grid */}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          {/* Left */}

          <div className="space-y-6">
            {/* Chart */}

            <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#090c14]">
              <div className="flex flex-col gap-3 border-b border-white/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <BarChart3
                      size={18}
                      className="text-blue-400"
                    />

                    <h2 className="font-semibold">
                      Price Chart
                    </h2>
                  </div>

                  <p className="mt-1 text-xs text-slate-500">
                    Drag horizontally to move through market history
                  </p>
                </div>

                <div className="relative">
                  <button
                    onClick={() =>
                      setShowChartMenu(
                        (value) =>
                          !value
                      )
                    }
                    className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
                  >
                    {chartType ===
                      "candlestick" && (
                      <CandlestickChart
                        size={15}
                      />
                    )}

                    {chartType ===
                      "line" && (
                      <LineChart
                        size={15}
                      />
                    )}

                    {chartType ===
                      "area" && (
                      <TrendingUp
                        size={15}
                      />
                    )}

                    {chartType ===
                    "candlestick"
                      ? "Candlestick"
                      : chartType ===
                          "line"
                        ? "Line"
                        : "Area"}

                    <ChevronDown
                      size={14}
                    />
                  </button>

                  {showChartMenu && (
                    <div className="absolute right-0 top-11 z-30 w-44 overflow-hidden rounded-xl border border-[#e2e9e2] bg-white p-1 shadow-xl">
                      <ChartTypeButton
                        active={
                          chartType ===
                          "candlestick"
                        }
                        icon={
                          <CandlestickChart
                            size={15}
                          />
                        }
                        label="Candlestick"
                        onClick={() =>
                          changeChartType(
                            "candlestick"
                          )
                        }
                      />

                      <ChartTypeButton
                        active={
                          chartType ===
                          "line"
                        }
                        icon={
                          <LineChart
                            size={15}
                          />
                        }
                        label="Line"
                        onClick={() =>
                          changeChartType(
                            "line"
                          )
                        }
                      />

                      <ChartTypeButton
                        active={
                          chartType ===
                          "area"
                        }
                        icon={
                          <TrendingUp
                            size={15}
                          />
                        }
                        label="Area"
                        onClick={() =>
                          changeChartType(
                            "area"
                          )
                        }
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Timeframe Selector */}

              <div className="overflow-x-auto border-b border-white/10 px-5 py-3">
                <div className="flex min-w-max items-center gap-1.5">
                  {TIMEFRAMES.map(
                    (item) => {
                      const active =
                        timeframe ===
                        item.value;

                      const live =
                        item.value ===
                          "5s" ||
                        item.value ===
                          "10s" ||
                        item.value ===
                          "30s";

                      return (
                        <button
                          key={
                            item.value
                          }
                          type="button"
                          onClick={() =>
                            handleTimeframeChange(
                              item.value
                            )
                          }
                          className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                            active
                              ? "border-blue-400/30 bg-blue-500/15 text-blue-300"
                              : "border-white/5 bg-white/[0.025] text-slate-500 hover:border-white/10 hover:bg-white/[0.06] hover:text-white"
                          }`}
                        >
                          {item.label}

                          {live && (
                            <span
                              className={`ml-1.5 inline-block h-1.5 w-1.5 rounded-full ${
                                active &&
                                marketConnected
                                  ? "animate-pulse bg-emerald-400"
                                  : "bg-slate-600"
                              }`}
                            />
                          )}
                        </button>
                      );
                    }
                  )}
                </div>
              </div>

              {chartLoading ? (
                <div className="flex h-[460px] items-center justify-center">
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Loader2
                      size={18}
                      className="animate-spin"
                    />

                    Loading{" "}
                    {timeframe.toUpperCase()}{" "}
                    chart...
                  </div>
                </div>
              ) : (
                <InteractiveTradingChart
                  candles={candles}
                  notice={chartNotice}
                  chartType={
                    chartType
                  }
                  timeframe={
                    timeframe
                  }
                  live={
                    liveTimeframe
                  }
                />
              )}
            </section>

            {/* AI Intelligence */}

            <section className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/[0.08] via-blue-500/[0.04] to-transparent p-5">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Sparkles
                      size={19}
                      className="text-violet-400"
                    />

                    <h2 className="font-semibold">
                      INVESTIQ Market Signal
                    </h2>
                  </div>

                  <p className="mt-1 text-xs text-slate-500">
                    Rules-based signal from current market data
                  </p>
                </div>

                <span className="rounded-full border border-violet-400/20 bg-violet-400/10 px-3 py-1 text-xs text-violet-300">
                  AI SCORE
                </span>
              </div>

              {loading &&
              !ai ? (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2
                    size={17}
                    className="animate-spin"
                  />

                  Analyzing market conditions...
                </div>
              ) : ai ? (
                <div className="grid gap-5 md:grid-cols-[170px_1fr]">
                  <div className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-black/20 p-5">
                    <div className="text-5xl font-bold">
                      {
                        ai.score
                      }
                    </div>

                    <div className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-500">
                      / 100
                    </div>

                    <div
                      className={`mt-4 flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${
                        ai.signal ===
                        "BUY"
                          ? "bg-emerald-500/10 text-emerald-400"
                          : ai.signal ===
                              "SELL"
                            ? "bg-red-500/10 text-red-400"
                            : "bg-amber-500/10 text-amber-400"
                      }`}
                    >
                      {ai.signal ===
                        "BUY" && (
                        <TrendingUp
                          size={14}
                        />
                      )}

                      {ai.signal ===
                        "SELL" && (
                        <TrendingDown
                          size={14}
                        />
                      )}

                      {ai.signal ===
                        "HOLD" && (
                        <Minus
                          size={14}
                        />
                      )}

                      {
                        ai.signal
                      }
                    </div>
                  </div>

                  <div>
                    <div className="mb-5">
                      <div className="mb-2 flex items-center justify-between text-xs">
                        <span className="text-slate-400">
                          AI score
                        </span>

                        <span className="font-semibold text-white">
                          {
                            ai.score
                          }
                          /100
                        </span>
                      </div>

                      <div className="h-2 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500 transition-all duration-700"
                          style={{
                            width: `${scoreProgress}%`,
                          }}
                        />
                      </div>
                    </div>

                    <div className="mb-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                        <p className="text-[11px] uppercase tracking-wider text-slate-500">
                          Signal strength
                        </p>

                        <p className="mt-1 text-lg font-semibold">
                          {
                            ai.confidence
                          }
                          %
                        </p>
                      </div>

                      <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                        <p className="text-[11px] uppercase tracking-wider text-slate-500">
                          Signal
                        </p>

                        <p className="mt-1 text-lg font-semibold">
                          {
                            ai.signal
                          }
                        </p>
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                        <Sparkles
                          size={15}
                          className="text-violet-400"
                        />

                        Why this score?
                      </div>

                      <p className="text-sm leading-6 text-slate-400">
                        {
                          ai.explanation
                        }
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  AI analysis is currently unavailable.
                </p>
              )}
            </section>


          </div>

          {/* Right Trading Panel */}

          <aside className="space-y-6">
            <section className="sticky top-5 rounded-2xl border border-white/10 bg-[#090c14] p-5 shadow-2xl shadow-black/20">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 className="font-semibold">
                    Paper Trade
                  </h2>

                  <p className="mt-1 text-xs text-slate-500">
                    Simulated execution
                  </p>
                </div>

                <div className="rounded-lg bg-blue-500/10 p-2 text-blue-400">
                  <Wallet size={18} />
                </div>
              </div>

              <div className="mb-5 grid grid-cols-2 rounded-xl border border-white/10 bg-black/20 p-1">
                <button
                  onClick={() =>
                    setOrderSide(
                      "BUY"
                    )
                  }
                  className={`rounded-lg py-2.5 text-sm font-semibold transition ${
                    orderSide ===
                    "BUY"
                      ? "bg-emerald-500 text-white"
                      : "text-slate-500 hover:text-white"
                  }`}
                >
                  Buy
                </button>

                <button
                  onClick={() =>
                    setOrderSide(
                      "SELL"
                    )
                  }
                  className={`rounded-lg py-2.5 text-sm font-semibold transition ${
                    orderSide ===
                    "SELL"
                      ? "bg-red-500 text-white"
                      : "text-slate-500 hover:text-white"
                  }`}
                >
                  Sell
                </button>
              </div>

              <div className="mb-5 rounded-xl border border-white/10 bg-white/[0.025] p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">
                    Market price
                  </span>

                  <span className="font-semibold">
                    {stock.price >
                    0
                      ? formatPrice(
                          stock.price
                        )
                      : "Loading..."}
                  </span>
                </div>
              </div>

              <label className="mb-2 block text-xs font-medium text-slate-400">
                Quantity
              </label>

              <div className="mb-5 flex items-center rounded-xl border border-white/10 bg-black/20">
                <button
                  onClick={() =>
                    setQuantity(
                      (value) =>
                        Math.max(
                          1,
                          value - 1
                        )
                    )
                  }
                  className="px-4 py-3 text-slate-400 transition hover:text-white"
                >
                  −
                </button>

                <input
                  value={quantity}
                  onChange={(
                    event
                  ) => {
                    const next =
                      Number(
                        event
                          .target
                          .value
                      );

                    if (
                      Number.isFinite(
                        next
                      ) &&
                      next >= 1
                    ) {
                      setQuantity(
                        Math.floor(
                          next
                        )
                      );
                    }
                  }}
                  type="number"
                  min="1"
                  className="w-full bg-transparent text-center text-sm font-semibold outline-none"
                />

                <button
                  onClick={() =>
                    setQuantity(
                      (value) =>
                        value + 1
                    )
                  }
                  className="px-4 py-3 text-slate-400 transition hover:text-white"
                >
                  +
                </button>
              </div>

              <div className="mb-5 space-y-3 rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">
                    Estimated value
                  </span>

                  <span className="font-semibold">
                    {formatCurrency(
                      totalOrderValue
                    )}
                  </span>
                </div>

                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">
                    Execution
                  </span>

                  <span className="text-blue-400">
                    Paper
                  </span>
                </div>
              </div>

              <button
                disabled={!hasPrice}
                onClick={() =>
                  router.push(
                    `/trade?symbol=${symbol}&side=${orderSide}`
                  )
                }
                className={`flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-45 ${
                  orderSide ===
                  "BUY"
                    ? "bg-emerald-500 text-white hover:bg-emerald-400"
                    : "bg-red-500 text-white hover:bg-red-400"
                }`}
              >
                {orderSide ===
                "BUY"
                  ? "Continue to Buy"
                  : "Continue to Sell"}
              </button>

              <p className="mt-4 text-center text-[11px] leading-5 text-slate-600">
                INVESTIQ is operating in paper-trading mode.
                No real money is invested.
              </p>
            </section>
          </aside>
        </div>

        {/* Disclaimer */}

        <div className="mt-6 rounded-xl border border-white/5 bg-white/[0.02] p-4 text-center text-xs leading-5 text-slate-600">
          INVESTIQ provides market information and simulated
          investment tools for educational purposes only. AI
          signals are not financial advice and should not be
          treated as a guarantee of future performance.
        </div>
      </div>
    </main>
  );
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-[105px] rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wider text-slate-500">
        {label}
      </p>

      <p className="mt-1 text-sm font-semibold text-slate-200">
        {value}
      </p>
    </div>
  );
}

function InfoCard({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#090c14] p-5">
      <div className="mb-3 flex items-center gap-2">
        {icon}

        <h3 className="text-sm font-semibold">
          {title}
        </h3>
      </div>

      <p className="text-sm leading-6 text-slate-500">
        {text}
      </p>
    </div>
  );
}

function ChartTypeButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs transition ${
        active
          ? "bg-[#eaf2eb] text-[#39734f]"
          : "text-[#66746a] hover:bg-[#f4f7f3] hover:text-[#24342a]"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

/* ============================================================
   TRADING CHART
   ============================================================ */

function InteractiveTradingChart({
  candles,
  notice,
  chartType,
  timeframe,
  live,
}: {
  candles: Candle[];
  notice: string;
  chartType: ChartType;
  timeframe: Timeframe;
  live: boolean;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [crosshairVisible, setCrosshairVisible] = useState(false);
  const [pointerPrice, setPointerPrice] = useState<number | null>(null);

  const width = 1000;
  const height = 460;
  const padding = { top: 30, right: 80, bottom: 35, left: 78 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  /*
     SIMPLE / STABLE CHART
     - No viewport state
     - No drag-to-pan
     - No wheel-to-pan
     - No moving/following-live logic
     - No visible timestamps
     - Cursor/crosshair remains available
  */
  const chartCandles = useMemo(() => {
    if (!candles.length) return [];
    return timeframe === "1d" ? candles.slice(-90) : candles.slice(-60);
  }, [candles, timeframe]);

  const prices = useMemo(() => {
    const values: number[] = [];
    chartCandles.forEach((candle) => {
      values.push(candle.high, candle.low);
    });
    return values.length ? values : [0, 1];
  }, [chartCandles]);

  const rawMin = Math.min(...prices);
  const rawMax = Math.max(...prices);
  const range = Math.max(rawMax - rawMin, Math.max(rawMax * 0.0025, 1));
  const chartMin = rawMin - range * 0.08;
  const chartMax = rawMax + range * 0.08;

  const getX = useCallback(
    (index: number) => {
      if (chartCandles.length <= 1) {
        return padding.left + chartWidth / 2;
      }
      return (
        padding.left +
        (index / (chartCandles.length - 1)) * chartWidth
      );
    },
    [chartCandles.length, chartWidth]
  );

  const getY = useCallback(
    (price: number) => {
      const ratio =
        chartMax === chartMin
          ? 0.5
          : (price - chartMin) / (chartMax - chartMin);
      return padding.top + (1 - ratio) * chartHeight;
    },
    [chartMax, chartMin, chartHeight]
  );

  const candleWidth = Math.max(
    3,
    Math.min(
      14,
      (chartWidth / Math.max(1, chartCandles.length)) * 0.62
    )
  );

  const closePath = useMemo(() => {
    if (!chartCandles.length) return '';
    return chartCandles
      .map((candle, index) => {
        const x = getX(index);
        const y = getY(candle.close);
        return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');
  }, [chartCandles, getX, getY]);

  const areaPath = useMemo(() => {
    if (!chartCandles.length || !closePath) return '';
    const firstX = getX(0);
    const lastX = getX(chartCandles.length - 1);
    const bottom = padding.top + chartHeight;
    return `${closePath} L ${lastX} ${bottom} L ${firstX} ${bottom} Z`;
  }, [chartCandles, closePath, getX, chartHeight]);

  const yTicks = useMemo(() => {
    return Array.from({ length: 5 }, (_, index) => {
      const ratio = index / 4;
      const price = chartMax - ratio * (chartMax - chartMin);
      return { price, y: getY(price) };
    });
  }, [chartMax, chartMin, getY]);

  const xTicks = useMemo(() => {
    if (!chartCandles.length) return [];
    const count = Math.min(6, chartCandles.length);
    return Array.from({ length: count }, (_, index) => {
      const candleIndex =
        count === 1
          ? 0
          : Math.round(
              (index / (count - 1)) * (chartCandles.length - 1)
            );
      return { index: candleIndex, x: getX(candleIndex), label: formatXAxisTime(chartCandles[candleIndex].time, timeframe) };
    });
  }, [chartCandles, getX, timeframe]);

  function getNearestIndex(clientX: number) {
    const svg = svgRef.current;
    if (!svg || !chartCandles.length) return null;

    const rect = svg.getBoundingClientRect();
    const svgX = ((clientX - rect.left) / rect.width) * width;
    const relativeX = Math.max(
      0,
      Math.min(chartWidth, svgX - padding.left)
    );
    const ratio = chartWidth > 0 ? relativeX / chartWidth : 0;

    return Math.max(
      0,
      Math.min(
        chartCandles.length - 1,
        Math.round(ratio * (chartCandles.length - 1))
      )
    );
  }

  function handlePointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const index = getNearestIndex(event.clientX);
    if (index === null) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const svgY = ((event.clientY - rect.top) / rect.height) * height;
    const clampedY = Math.max(padding.top, Math.min(padding.top + chartHeight, svgY));
    const priceRatio = 1 - (clampedY - padding.top) / chartHeight;
    setPointerPrice(chartMin + priceRatio * (chartMax - chartMin));
    setHoverIndex(index);
    setCrosshairVisible(true);
  }

  function handlePointerLeave() {
    setCrosshairVisible(false);
    setHoverIndex(null);
    setPointerPrice(null);
  }

  if (!chartCandles.length) {
    return (
      <div className="flex h-[460px] items-center justify-center px-6">
        <div className="max-w-md text-center">
          <BarChart3 size={34} className="mx-auto mb-3 text-slate-600" />
          <p className="text-sm font-medium text-slate-400">
            {live
              ? 'Waiting for live market candles...'
              : 'Historical chart data is not available yet.'}
          </p>
          <p className="mt-2 text-xs leading-5 text-slate-600">
            {notice || "Try another timeframe or refresh the market data."}
          </p>
        </div>
      </div>
    );
  }

  const activeIndex =
    hoverIndex === null ? chartCandles.length - 1 : hoverIndex;
  const hoveredCandle = chartCandles[activeIndex];
  const hoverX = getX(activeIndex);
  const hoverY = getY(pointerPrice ?? hoveredCandle.close);

  return (
    <div className="relative w-full">
      <div className="absolute left-5 top-4 z-10 flex items-center gap-2 rounded-lg border border-white/10 bg-[#090c14]/95 px-3 py-2 text-[11px] text-slate-400 backdrop-blur">
        {live && (
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
        )}
        {live ? `LIVE ${timeframe}` : 'MARKET DATA'}
      </div>

      {crosshairVisible && hoveredCandle && (
        <div className="absolute right-5 top-4 z-10 rounded-xl border border-[#e2e9e2] bg-white/95 px-4 py-3 text-xs shadow-lg backdrop-blur">
          <p className="mb-2 border-b border-white/10 pb-2 text-[10px] font-medium text-slate-400">{formatFullDate(hoveredCandle.time)}</p>
          <div className="grid grid-cols-2 gap-x-5 gap-y-1">
            <span className="text-slate-500">Open</span>
            <span className="text-right font-medium">{formatPrice(hoveredCandle.open)}</span>
            <span className="text-slate-500">High</span>
            <span className="text-right font-medium text-emerald-400">{formatPrice(hoveredCandle.high)}</span>
            <span className="text-slate-500">Low</span>
            <span className="text-right font-medium text-red-400">{formatPrice(hoveredCandle.low)}</span>
            <span className="text-slate-500">Close</span>
            <span className="text-right font-semibold text-blue-300">{formatPrice(hoveredCandle.close)}</span>
            <span className="text-slate-500">Volume</span>
            <span className="text-right font-medium">{formatNumber(hoveredCandle.volume ?? 0)}</span>
          </div>
        </div>
      )}

      <div className="overflow-hidden px-2 pt-2">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto w-full select-none"
          onPointerMove={handlePointerMove}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            handlePointerMove(event);
          }}
          onPointerUp={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
          }}
          onPointerLeave={handlePointerLeave}
          style={{ touchAction: 'none', cursor: 'crosshair' }}
        >
          {yTicks.map((tick) => (
            <g key={tick.price}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={tick.y}
                y2={tick.y}
                stroke="#e1e8e1"
                strokeWidth="1"
              />
              <text
                x={width - padding.right + 8}
                y={tick.y + 4}
                fill="#64748b"
                fontSize="11"
              >
                {formatPrice(tick.price)}
              </text>
            </g>
          ))}

          {xTicks.map((tick) => (
            <text
              key={tick.index}
              x={tick.x}
              y={height - 12}
              textAnchor="middle"
              fill="#475569"
              fontSize="10"
            >
              {formatXAxisTime(chartCandles[tick.index].time, timeframe)}
            </text>
          ))}

          {chartType === 'area' && areaPath && (
            <path d={areaPath} fill="#39734f" opacity="0.10" />
          )}

          {chartType === 'line' || chartType === 'area' ? (
            <path
              d={closePath}
              fill="none"
              stroke="#39734f"
              strokeWidth="2.2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : (
            chartCandles.map((candle, index) => {
              const x = getX(index);
              const highY = getY(candle.high);
              const lowY = getY(candle.low);
              const openY = getY(candle.open);
              const closeY = getY(candle.close);
              const bullish = candle.close >= candle.open;
              const bodyTop = Math.min(openY, closeY);
              const bodyHeight = Math.max(1.5, Math.abs(closeY - openY));

              return (
                <g key={`${index}-${candle.time}`}>
                  <line
                    x1={x}
                    x2={x}
                    y1={highY}
                    y2={lowY}
                    stroke={bullish ? '#39734f' : '#a95548'}
                    strokeWidth="1.2"
                  />
                  <rect
                    x={x - candleWidth / 2}
                    y={bodyTop}
                    width={candleWidth}
                    height={bodyHeight}
                    rx="1"
                    fill={bullish ? '#39734f' : '#a95548'}
                    opacity="0.9"
                  />
                </g>
              );
            })
          )}

          {crosshairVisible && (
            <>
              <line
                x1={hoverX}
                x2={hoverX}
                y1={padding.top}
                y2={padding.top + chartHeight}
                stroke="#94a3b8"
                strokeWidth="1"
                strokeDasharray="4 4"
                opacity="0.75"
              />
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={hoverY}
                y2={hoverY}
                stroke="#94a3b8"
                strokeWidth="1"
                strokeDasharray="4 4"
                opacity="0.75"
              />
              <circle
                cx={hoverX}
                cy={hoverY}
                r="4"
                fill="#39734f"
                stroke="#ffffff"
                strokeWidth="2"
              />
              <rect
                x={width - padding.right + 5}
                y={hoverY - 11}
                width="68"
                height="22"
                rx="5"
                fill="#39734f"
              />
              <text
                x={width - padding.right + 39}
                y={hoverY + 4}
                textAnchor="middle"
                fill="#ffffff"
                fontSize="10"
                fontWeight="600"
              >
                {formatPrice(pointerPrice ?? hoveredCandle.close)}
              </text>
            </>
          )}
        </svg>
      </div>

      <div className="flex items-center justify-between border-t border-white/5 px-5 py-3 text-[11px] text-slate-600">
        <span>Showing last {chartCandles.length} candles</span>
        <span>Move cursor over chart for details</span>
      </div>
    </div>
  );
}
