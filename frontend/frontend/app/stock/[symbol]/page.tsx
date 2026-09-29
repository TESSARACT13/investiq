"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  Brain,
  ChevronDown,
  Clock3,
  DollarSign,
  Info,
  LineChart,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Wallet,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Stock = {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  previousClose: number;
  ltq: number;
  timestamp?: number;
};

const STOCK_NAMES: Record<string, string> = {
  RELIANCE: "Reliance Industries",
  TCS: "Tata Consultancy Services",
  INFY: "Infosys",
  HDFCBANK: "HDFC Bank",
};

const DEFAULT_PRICES: Record<string, number> = {
  RELIANCE: 1226,
  TCS: 2082,
  INFY: 1000.2,
  HDFCBANK: 735.6,
};

export default function StockDetailsPage() {
  const params = useParams();
  const router = useRouter();

  const symbol = String(params.symbol || "").toUpperCase();

  const [stock, setStock] = useState<Stock | null>(null);
  const [connected, setConnected] = useState(false);
  const [quantity, setQuantity] = useState(10);
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [chartData, setChartData] = useState<
    { time: string; price: number }[]
  >([]);

  const companyName =
    STOCK_NAMES[symbol] || `${symbol} Corporation`;

  useEffect(() => {
    const socket = new WebSocket("ws://127.0.0.1:8000/ws/market");

    socket.onopen = () => {
      setConnected(true);
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type !== "market_update") return;

        const incoming = data.stocks?.find(
          (item: Stock) => item.symbol === symbol
        );

        if (!incoming) return;

        setStock(incoming);

        setChartData((previous) => {
          const now = new Date();

          const time = now.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          });

          const next = [
            ...previous,
            {
              time,
              price: incoming.price,
            },
          ];

          return next.slice(-40);
        });
      } catch (error) {
        console.error("Market message error:", error);
      }
    };

    socket.onclose = () => {
      setConnected(false);
    };

    socket.onerror = () => {
      setConnected(false);
    };

    return () => {
      socket.close();
    };
  }, [symbol]);

  const currentPrice = stock?.price || DEFAULT_PRICES[symbol] || 0;

  const change = stock?.change || 0;
  const changePercent = stock?.changePercent || 0;

  const estimatedValue = currentPrice * quantity;

  const aiScore = useMemo(() => {
    if (changePercent >= 2) return 86;
    if (changePercent >= 1) return 79;
    if (changePercent >= 0) return 74;
    if (changePercent >= -1) return 61;
    return 48;
  }, [changePercent]);

  const signal =
    aiScore >= 80 ? "BUY" : aiScore >= 65 ? "HOLD" : "WATCH";

  const signalDescription =
    signal === "BUY"
      ? "Positive momentum with improving short-term market conditions."
      : signal === "HOLD"
        ? "Momentum is mixed. Existing positions can be monitored."
        : "Momentum is currently weak. Wait for stronger confirmation.";

  const goToTrade = () => {
    router.push(
      `/trade?symbol=${encodeURIComponent(symbol)}&side=${side}`
    );
  };

  if (!STOCK_NAMES[symbol]) {
    return (
      <main className="min-h-screen bg-[#070b12] text-white flex items-center justify-center px-6">
        <div className="text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
            <Info className="h-7 w-7 text-white/60" />
          </div>

          <h1 className="text-2xl font-semibold">
            Stock not found
          </h1>

          <p className="mt-2 text-sm text-white/50">
            This stock is not currently available in INVESTIQ.
          </p>

          <button
            onClick={() => router.push("/markets")}
            className="mt-6 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-white/90"
          >
            Back to Markets
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#070b12] text-white">
      <div className="mx-auto max-w-[1500px] px-5 py-6 md:px-8 lg:px-10">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <button
            onClick={() => router.push("/markets")}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-white/70 transition hover:bg-white/[0.06] hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Markets
          </button>

          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2">
            <span
              className={`h-2 w-2 rounded-full ${
                connected ? "bg-emerald-400" : "bg-red-400"
              }`}
            />

            <span className="text-xs text-white/60">
              {connected ? "Live market data" : "Disconnected"}
            </span>
          </div>
        </div>

        {/* Stock Hero */}
        <section className="mb-6 rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-6 shadow-2xl shadow-black/20 md:p-8">
          <div className="flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
                  <TrendingUp className="h-6 w-6 text-cyan-300" />
                </div>

                <div>
                  <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
                      {symbol}
                    </h1>

                    <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-white/40">
                      NSE
                    </span>
                  </div>

                  <p className="mt-1 text-sm text-white/45">
                    {companyName}
                  </p>
                </div>
              </div>

              <div className="mt-7 flex flex-wrap items-end gap-4">
                <div className="text-4xl font-bold tracking-tight md:text-5xl">
                  ₹
                  {currentPrice.toLocaleString("en-IN", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>

                <div
                  className={`mb-1 flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-semibold ${
                    change >= 0
                      ? "bg-emerald-400/10 text-emerald-400"
                      : "bg-red-400/10 text-red-400"
                  }`}
                >
                  {change >= 0 ? (
                    <ArrowUpRight className="h-4 w-4" />
                  ) : (
                    <ArrowDownRight className="h-4 w-4" />
                  )}

                  {change >= 0 ? "+" : ""}
                  {change.toFixed(2)} (
                  {changePercent >= 0 ? "+" : ""}
                  {changePercent.toFixed(2)}%)
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:min-w-[480px]">
              <Stat
                label="Previous Close"
                value={`₹${(stock?.previousClose || currentPrice).toFixed(2)}`}
              />

              <Stat
                label="Day High"
                value={`₹${(currentPrice * 1.012).toFixed(2)}`}
              />

              <Stat
                label="Day Low"
                value={`₹${(currentPrice * 0.988).toFixed(2)}`}
              />

              <Stat
                label="Last Trade Qty"
                value={`${(stock?.ltq || 0).toLocaleString("en-IN")}`}
              />
            </div>
          </div>
        </section>

        {/* Main Grid */}
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          {/* Chart */}
          <section className="rounded-3xl border border-white/10 bg-white/[0.025] p-5 md:p-7">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <LineChart className="h-4 w-4 text-cyan-300" />
                  <h2 className="font-semibold">
                    Price Movement
                  </h2>
                </div>

                <p className="mt-1 text-xs text-white/40">
                  Live price stream from Upstox
                </p>
              </div>

              <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
                {["1D", "1W", "1M"].map((period, index) => (
                  <button
                    key={period}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                      index === 0
                        ? "bg-white/10 text-white"
                        : "text-white/40 hover:text-white"
                    }`}
                  >
                    {period}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-[360px] w-full">
              {chartData.length > 1 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient
                        id="priceGradient"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor="#22c55e"
                          stopOpacity={0.28}
                        />
                        <stop
                          offset="100%"
                          stopColor="#22c55e"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>

                    <CartesianGrid
                      stroke="rgba(255,255,255,0.06)"
                      vertical={false}
                    />

                    <XAxis
                      dataKey="time"
                      tick={{
                        fill: "rgba(255,255,255,0.3)",
                        fontSize: 10,
                      }}
                      axisLine={false}
                      tickLine={false}
                      minTickGap={40}
                    />

                    <YAxis
                      domain={["auto", "auto"]}
                      tick={{
                        fill: "rgba(255,255,255,0.3)",
                        fontSize: 10,
                      }}
                      axisLine={false}
                      tickLine={false}
                      width={60}
                      tickFormatter={(value) =>
                        `₹${Number(value).toFixed(0)}`
                      }
                    />

                    <Tooltip
                      contentStyle={{
                        background: "#0c111b",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: 12,
                        color: "#fff",
                      }}
                      labelStyle={{
                        color: "rgba(255,255,255,0.5)",
                        fontSize: 11,
                      }}
                      formatter={(value) => [
                        `₹${Number(value).toFixed(2)}`,
                        "Price",
                      ]}
                    />

                    <Area
                      type="monotone"
                      dataKey="price"
                      stroke="#22c55e"
                      strokeWidth={2}
                      fill="url(#priceGradient)"
                      dot={false}
                      activeDot={{
                        r: 4,
                        strokeWidth: 0,
                      }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-white/10">
                  <div className="text-center">
                    <LineChart className="mx-auto mb-3 h-7 w-7 text-white/20" />
                    <p className="text-sm text-white/40">
                      Building live price chart...
                    </p>
                    <p className="mt-1 text-xs text-white/25">
                      Waiting for market ticks
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Trade Panel */}
          <aside className="rounded-3xl border border-white/10 bg-white/[0.025] p-5 md:p-7">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="font-semibold">
                  Paper Trade
                </h2>

                <p className="mt-1 text-xs text-white/40">
                  Simulated execution only
                </p>
              </div>

              <Wallet className="h-5 w-5 text-white/30" />
            </div>

            {/* Buy / Sell */}
            <div className="mb-6 grid grid-cols-2 rounded-xl bg-black/20 p-1">
              <button
                onClick={() => setSide("BUY")}
                className={`rounded-lg py-2.5 text-sm font-semibold transition ${
                  side === "BUY"
                    ? "bg-emerald-500/15 text-emerald-400"
                    : "text-white/40 hover:text-white"
                }`}
              >
                Buy
              </button>

              <button
                onClick={() => setSide("SELL")}
                className={`rounded-lg py-2.5 text-sm font-semibold transition ${
                  side === "SELL"
                    ? "bg-red-500/15 text-red-400"
                    : "text-white/40 hover:text-white"
                }`}
              >
                Sell
              </button>
            </div>

            {/* Quantity */}
            <label className="mb-2 block text-xs font-medium text-white/45">
              Quantity
            </label>

            <div className="mb-5 flex items-center rounded-xl border border-white/10 bg-black/20">
              <button
                onClick={() =>
                  setQuantity((value) =>
                    Math.max(1, value - 1)
                  )
                }
                className="px-4 py-3 text-white/40 hover:text-white"
              >
                −
              </button>

              <input
                type="number"
                min={1}
                value={quantity}
                onChange={(event) =>
                  setQuantity(
                    Math.max(
                      1,
                      Number(event.target.value) || 1
                    )
                  )
                }
                className="w-full bg-transparent py-3 text-center text-sm font-semibold outline-none"
              />

              <button
                onClick={() =>
                  setQuantity((value) => value + 1)
                }
                className="px-4 py-3 text-white/40 hover:text-white"
              >
                +
              </button>
            </div>

            {/* Order Summary */}
            <div className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex justify-between text-sm">
                <span className="text-white/40">
                  Market price
                </span>

                <span>
                  ₹{currentPrice.toFixed(2)}
                </span>
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-white/40">
                  Quantity
                </span>

                <span>{quantity}</span>
              </div>

              <div className="my-2 border-t border-white/10" />

              <div className="flex justify-between">
                <span className="text-sm text-white/50">
                  Estimated value
                </span>

                <span className="font-semibold">
                  ₹
                  {estimatedValue.toLocaleString(
                    "en-IN",
                    {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    }
                  )}
                </span>
              </div>
            </div>

            <button
              onClick={goToTrade}
              className={`mt-5 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold transition ${
                side === "BUY"
                  ? "bg-emerald-500 text-black hover:bg-emerald-400"
                  : "bg-red-500 text-white hover:bg-red-400"
              }`}
            >
              {side === "BUY" ? "Buy" : "Sell"} {symbol}
              <ChevronDown className="h-4 w-4 rotate-[-90deg]" />
            </button>

            <div className="mt-4 flex items-center justify-center gap-2 text-[11px] text-white/30">
              <ShieldCheck className="h-3.5 w-3.5" />
              Paper trading • No real money
            </div>
          </aside>
        </div>

        {/* AI Intelligence */}
        <section className="mt-6 rounded-3xl border border-violet-400/10 bg-gradient-to-br from-violet-500/[0.08] via-white/[0.025] to-cyan-500/[0.05] p-6 md:p-7">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-500/15">
                <Brain className="h-6 w-6 text-violet-300" />
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold">
                    INVESTIQ Intelligence
                  </h2>

                  <Sparkles className="h-4 w-4 text-violet-300" />
                </div>

                <p className="mt-1 max-w-2xl text-sm leading-6 text-white/45">
                  {signalDescription}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-5">
              <div className="text-center">
                <p className="text-[10px] uppercase tracking-widest text-white/30">
                  AI Score
                </p>

                <p className="mt-1 text-3xl font-bold">
                  {aiScore}
                  <span className="text-sm text-white/30">
                    /100
                  </span>
                </p>
              </div>

              <div className="h-10 w-px bg-white/10" />

              <div>
                <p className="text-[10px] uppercase tracking-widest text-white/30">
                  Signal
                </p>

                <p
                  className={`mt-1 text-xl font-bold ${
                    signal === "BUY"
                      ? "text-emerald-400"
                      : signal === "HOLD"
                        ? "text-amber-400"
                        : "text-red-400"
                  }`}
                >
                  {signal}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <Insight
              icon={<BarChart3 className="h-4 w-4" />}
              title="Momentum"
              value={
                changePercent >= 0
                  ? "Positive"
                  : "Weak"
              }
            />

            <Insight
              icon={<TrendingUp className="h-4 w-4" />}
              title="Price Trend"
              value={
                changePercent >= 0
                  ? "Upward"
                  : "Downward"
              }
            />

            <Insight
              icon={<Clock3 className="h-4 w-4" />}
              title="Market State"
              value="Live"
            />
          </div>
        </section>

        {/* Bottom Information */}
        <section className="mt-6 grid gap-6 md:grid-cols-2">
          <InfoCard
            icon={<DollarSign className="h-5 w-5" />}
            title="Market Information"
          >
            <InfoRow label="Exchange" value="NSE" />
            <InfoRow label="Instrument" value={symbol} />
            <InfoRow
              label="Previous Close"
              value={`₹${(stock?.previousClose || currentPrice).toFixed(2)}`}
            />
            <InfoRow
              label="Last Trade Quantity"
              value={`${(stock?.ltq || 0).toLocaleString("en-IN")}`}
            />
          </InfoCard>

          <InfoCard
            icon={<Sparkles className="h-5 w-5" />}
            title="Why INVESTIQ?"
          >
            <div className="space-y-3 text-sm leading-6 text-white/45">
              <p>
                INVESTIQ combines real-time market data,
                portfolio context and AI-driven signals in
                one interface.
              </p>

              <p>
                All trades on this platform are simulated
                using virtual funds for learning and
                experimentation.
              </p>
            </div>
          </InfoCard>
        </section>

        <footer className="py-10 text-center text-xs text-white/25">
          INVESTIQ • Real-time market intelligence
        </footer>
      </div>
    </main>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
      <p className="text-[10px] uppercase tracking-wider text-white/30">
        {label}
      </p>

      <p className="mt-2 text-sm font-semibold text-white/80">
        {value}
      </p>
    </div>
  );
}

function Insight({
  icon,
  title,
  value,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/10 p-4">
      <div className="text-white/40">{icon}</div>

      <div>
        <p className="text-[10px] uppercase tracking-wider text-white/30">
          {title}
        </p>

        <p className="mt-1 text-sm font-medium">
          {value}
        </p>
      </div>
    </div>
  );
}

function InfoCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.025] p-6">
      <div className="mb-5 flex items-center gap-3">
        <div className="text-cyan-300">{icon}</div>

        <h2 className="font-semibold">{title}</h2>
      </div>

      {children}
    </div>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between border-b border-white/[0.06] py-3 last:border-0">
      <span className="text-sm text-white/40">
        {label}
      </span>

      <span className="text-sm font-medium text-white/75">
        {value}
      </span>
    </div>
  );
}
