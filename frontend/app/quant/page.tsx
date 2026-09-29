"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { API_URL } from "@/lib/api";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BrainCircuit,
  FlaskConical,
  Play,
  RefreshCw,
  Shield,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";

type Stock = {
  symbol: string;
  price: number;
  previous_close: number;
  change: number;
  change_percent: number;
};

type AIStock = Stock & {
  score: number;
  signal: "BUY" | "HOLD" | "SELL";
  confidence: number;
  explanation: string;
};

type Strategy = "Momentum" | "Mean Reversion" | "Trend Following";

type StrategyStock = AIStock & {
  quantScore: number;
  quantSignal: "BUY" | "HOLD" | "SELL";
};

function evaluateStrategy(stock: AIStock, strategy: Strategy): StrategyStock {
  const dailyMove = Math.max(-5, Math.min(5, stock.change_percent));
  const adjustment = strategy === "Momentum"
    ? dailyMove * 2
    : strategy === "Mean Reversion"
      ? -dailyMove * 1.5
      : dailyMove;
  const quantScore = Math.max(0, Math.min(100, Math.round(stock.score + adjustment)));

  return {
    ...stock,
    quantScore,
    quantSignal: quantScore >= 62 ? "BUY" : quantScore <= 39 ? "SELL" : "HOLD",
  };
}

function suggestedShares(
  price: number,
  cash: number,
  positionPercent: number,
  riskPercent: number,
  stopLossPercent: number,
) {
  if (price <= 0 || cash <= 0 || stopLossPercent <= 0) return 0;
  const maxPositionValue = cash * (positionPercent / 100);
  const maxRiskValue = cash * (riskPercent / 100);
  const riskPerShare = price * (stopLossPercent / 100);
  return Math.max(0, Math.min(
    Math.floor(maxPositionValue / price),
    Math.floor(maxRiskValue / riskPerShare),
    Math.floor(cash / price),
  ));
}

function normalizeStocks(data: unknown): AIStock[] {
  if (!data || typeof data !== "object") {
    return [];
  }

  const response = data as Record<string, unknown>;

  const raw =
    response.stocks ??
    response.scores ??
    response.data;

  if (!raw) {
    return [];
  }

  const convert = (
    value: unknown,
    fallbackSymbol?: string
  ): AIStock | null => {
    if (!value || typeof value !== "object") {
      return null;
    }

    const item = value as Record<string, unknown>;

    const symbol = String(
      item.symbol ?? fallbackSymbol ?? ""
    )
      .trim()
      .toUpperCase();

    if (!symbol) {
      return null;
    }

    const price = Number(
      item.price ??
        item.last_price ??
        item.ltp ??
        0
    );

    const previousClose = Number(
      item.previous_close ??
        item.cp ??
        0
    );

    const change = Number(
      item.change ??
        price - previousClose
    );

    const changePercent = Number(
      item.change_percent ??
        (previousClose
          ? (change / previousClose) * 100
          : 0)
    );

    const score = Math.round(
      Number(item.score ?? 50)
    );

    const signalValue = String(
      item.signal ?? "HOLD"
    ).toUpperCase();

    const signal: "BUY" | "HOLD" | "SELL" =
      signalValue === "BUY"
        ? "BUY"
        : signalValue === "SELL"
        ? "SELL"
        : "HOLD";

    return {
      symbol,
      price,
      previous_close: previousClose,
      change,
      change_percent: changePercent,
      score,
      signal,
      confidence: Number(
        item.confidence ?? 50
      ),
      explanation: String(
        item.explanation ??
          "Market conditions are relatively neutral."
      ),
    };
  };

  if (
    typeof raw === "object" &&
    !Array.isArray(raw)
  ) {
    return Object.entries(
      raw as Record<string, unknown>
    )
      .map(([symbol, value]) =>
        convert(value, symbol)
      )
      .filter(
        (
          item: AIStock | null
        ): item is AIStock =>
          item !== null
      );
  }

  if (Array.isArray(raw)) {
    return raw
      .map((item) => convert(item))
      .filter(
        (
          item: AIStock | null
        ): item is AIStock =>
          item !== null
      );
  }

  return [];
}

export default function QuantPage() {
  const [strategy, setStrategy] =
    useState<Strategy>("Momentum");

  const [stocks, setStocks] =
    useState<AIStock[]>([]);

  const [selectedSymbol, setSelectedSymbol] =
    useState("DRREDDY");

  const [availableCash, setAvailableCash] = useState(100000);
  const [strategyMessage, setStrategyMessage] = useState("");
  const [autoTradeCandidate, setAutoTradeCandidate] = useState<StrategyStock | null>(null);
  const [autoTradeMessage, setAutoTradeMessage] = useState("");

  const [loading, setLoading] =
    useState(true);

  const [search, setSearch] =
    useState("");

  const [riskPercent, setRiskPercent] =
    useState(2);

  const [positionPercent, setPositionPercent] =
    useState(10);

  const [stopLoss, setStopLoss] =
    useState(5);

  const strategies: {
    name: Strategy;
    description: string;
  }[] = [
    {
      name: "Momentum",
      description:
        "Prioritizes stocks showing strong positive or negative price momentum.",
    },
    {
      name: "Mean Reversion",
      description:
        "Looks for stocks that may revert after moving significantly away from recent levels.",
    },
    {
      name: "Trend Following",
      description:
        "Attempts to participate in established market trends using directional signals.",
    },
  ];

  async function loadAIData() {
    try {
      setLoading(true);

      const response = await fetch(
        `${API_URL}/ai/scores`,
        {
          cache: "no-store",
        }
      );

      if (!response.ok) {
        throw new Error("AI endpoint failed");
      }

      const data = await response.json();

      if (data?.source === "fallback") {
        setStocks([]);
        return;
      }

      const normalized =
        normalizeStocks(data);

      if (normalized.length > 0) {
        setStocks(normalized);

        const currentExists =
          normalized.some(
            (stock) =>
              stock.symbol === selectedSymbol
          );

        if (!currentExists) {
          setSelectedSymbol(
            normalized[0].symbol
          );
        }
      }
    } catch (error) {
      console.error(
        "Quant data error:",
        error
      );

      setStocks([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const updateCash = () => {
      const stored = Number(window.localStorage.getItem("investiq_cash") ?? 100000);
      setAvailableCash(Number.isFinite(stored) && stored >= 0 ? stored : 100000);
    };

    updateCash();
    window.addEventListener("investiq-data-updated", updateCash);
    window.addEventListener("storage", updateCash);

    return () => {
      window.removeEventListener("investiq-data-updated", updateCash);
      window.removeEventListener("storage", updateCash);
    };
  }, []);

  useEffect(() => {
    loadAIData();

    const interval = setInterval(
      loadAIData,
      30000
    );

    return () =>
      clearInterval(interval);
  }, []);

  const filteredStocks = useMemo(() => {
    return stocks
      .filter((stock) =>
        stock.symbol
          .toLowerCase()
          .includes(search.toLowerCase())
      )
      .sort(
        (a, b) =>
          b.score - a.score
      );
  }, [stocks, search]);

  const selectedStock =
    stocks.find(
      (stock) =>
        stock.symbol === selectedSymbol
    ) ??
    stocks[0];

  const selectedEvaluation = selectedStock
    ? evaluateStrategy(selectedStock, strategy)
    : null;
  const quantScore = selectedEvaluation?.quantScore ?? 0;
  const quantSignal = selectedEvaluation?.quantSignal ?? "HOLD";

  const rankedStocks = useMemo(
    () => stocks
      .map((stock) => evaluateStrategy(stock, strategy))
      .sort((a, b) => b.quantScore - a.quantScore),
    [stocks, strategy]
  );
  const buyOpportunities = rankedStocks.filter((stock) =>
    stock.quantSignal === "BUY" && suggestedShares(
      stock.price,
      availableCash,
      positionPercent,
      riskPercent,
      stopLoss,
    ) > 0
  );

  // The score is a rules based signal, not a measured win probability.
  const confidence = selectedStock
    ? Math.min(65, selectedStock.confidence)
    : 0;

  const maxPosition = availableCash * (positionPercent / 100);
  const maxRisk = availableCash * (riskPercent / 100);
  const selectedPrice = selectedStock?.price ?? 0;
  const suggestedQuantity = suggestedShares(
    selectedPrice,
    availableCash,
    positionPercent,
    riskPercent,
    stopLoss,
  );
  const positionValue = suggestedQuantity * selectedPrice;

  function runStrategy() {
    if (!selectedStock || !buyOpportunities.length) {
      setStrategyMessage(`No BUY setup meets the ${strategy} rules right now.`);
      return;
    }

    const best = buyOpportunities[0];
    setSelectedSymbol(best.symbol);
    setStrategyMessage(`${best.symbol} is the strongest ${strategy} setup in the current feed. Review the score and risk-sized quantity below.`);
  }

  function findAutoTradeSetup() {
    const candidate = buyOpportunities[0];
    setAutoTradeCandidate(candidate ?? null);

    if (!candidate) {
      setAutoTradeMessage(`No BUY setup meets the ${strategy} rules right now.`);
      return;
    }

    setSelectedSymbol(candidate.symbol);
    const quantity = suggestedShares(
      candidate.price,
      availableCash,
      positionPercent,
      riskPercent,
      stopLoss,
    );
    setAutoTradeMessage(quantity > 0
      ? `Found ${candidate.symbol}: ${quantity} shares fit your current position and risk limits. Review the paper order before submitting.`
      : "The top setup was found, but your current cash and risk limits allow zero shares.");
  }

  return (
    <main className="min-h-screen bg-[#070b14] text-white">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">

        {/* Header */}
        <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-blue-400">
              <FlaskConical size={18} />

              <span className="text-sm font-semibold uppercase tracking-wider">
                INVESTIQ Quant Lab
              </span>
            </div>

            <h1 className="text-3xl font-bold md:text-4xl">
              Quantitative Trading Lab
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400 md:text-base">
              Combine real-time market data, AI signals,
              quantitative strategies, and risk controls
              to simulate paper trades.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={loadAIData}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-300 transition hover:bg-white/[0.08]"
            >
              <RefreshCw
                size={16}
                className={
                  loading
                    ? "animate-spin"
                    : ""
                }
              />

              Refresh
            </button>

            <div className="flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-4 py-2 text-sm text-blue-400">
              <span className="h-2 w-2 rounded-full bg-blue-400" />
              Paper Trading
            </div>
          </div>
        </div>

        {/* Top Stats */}
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wider text-slate-500">
                Universe
              </p>

              <Activity
                size={18}
                className="text-blue-400"
              />
            </div>

            <p className="mt-2 text-2xl font-bold">
              {stocks.length}
            </p>

            <p className="mt-1 text-xs text-slate-500">
              AI-scored stocks
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wider text-slate-500">
                Selected
              </p>

              <Target
                size={18}
                className="text-violet-400"
              />
            </div>

            <p className="mt-2 text-2xl font-bold">
              {selectedStock?.symbol ?? "—"}
            </p>

            <p className="mt-1 text-xs text-slate-500">
              ₹
              {(selectedStock?.price ?? 0).toLocaleString(
                "en-IN",
                {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                }
              )}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wider text-slate-500">
                Quant Score
              </p>

              <BrainCircuit
                size={18}
                className="text-blue-400"
              />
            </div>

            <p className="mt-2 text-2xl font-bold">
              {quantScore}
              <span className="text-sm text-slate-500">
                /100
              </span>
            </p>

            <p className="mt-1 text-xs text-slate-500">
              AI + strategy signal
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wider text-slate-500">
                Signal
              </p>

              {quantSignal === "BUY" ? (
                <ArrowUpRight
                  size={18}
                  className="text-emerald-400"
                />
              ) : (
                <ArrowDownRight
                  size={18}
                  className={
                    quantSignal === "SELL"
                      ? "text-red-400"
                      : "text-yellow-400"
                  }
                />
              )}
            </div>

            <p
              className={`mt-2 text-2xl font-bold ${
                quantSignal === "BUY"
                  ? "text-emerald-400"
                  : quantSignal === "SELL"
                  ? "text-red-400"
                  : "text-yellow-400"
              }`}
            >
              {quantSignal}
            </p>

            <p className="mt-1 text-xs text-slate-500">
              {confidence}% signal strength
            </p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">

          {/* Strategies */}
          <section className="lg:col-span-2 rounded-2xl border border-white/10 bg-white/[0.03] p-6">

            <div className="mb-6">
              <h2 className="text-xl font-semibold">
                Strategy Engine
              </h2>

              <p className="mt-1 text-sm text-slate-400">
                Select a quantitative strategy and
                apply it to the live AI-scored universe.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {strategies.map(
                (item) => (
                  <button
                    key={item.name}
                    onClick={() =>
                      setStrategy(
                        item.name
                      )
                    }
                    className={`rounded-xl border p-4 text-left transition ${
                      strategy ===
                      item.name
                        ? "border-blue-400/50 bg-blue-500/10"
                        : "border-white/10 bg-[#0b101b] hover:bg-white/[0.05]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold">
                        {item.name}
                      </h3>

                      <div
                        className={`h-3 w-3 rounded-full ${
                          strategy ===
                          item.name
                            ? "bg-blue-400"
                            : "border border-slate-600"
                        }`}
                      />
                    </div>

                    <p className="mt-3 text-xs leading-5 text-slate-400">
                      {item.description}
                    </p>
                  </button>
                )
              )}
            </div>

            {/* Search + Stock */}
            <div className="mt-6 grid gap-3 md:grid-cols-[1fr_auto]">
              <input
                value={search}
                onChange={(event) =>
                  setSearch(
                    event.target.value
                  )
                }
                placeholder="Search stock symbol..."
                className="rounded-xl border border-white/10 bg-[#0b101b] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-blue-400/50"
              />

              <select
                value={selectedSymbol}
                onChange={(event) =>
                  setSelectedSymbol(
                    event.target.value
                  )
                }
                className="rounded-xl border border-white/10 bg-[#0b101b] px-4 py-3 text-sm text-white outline-none"
              >
                {filteredStocks
                  .slice(0, 100)
                  .map((stock) => (
                    <option
                      key={stock.symbol}
                      value={
                        stock.symbol
                      }
                    >
                      {stock.symbol} — ₹
                      {stock.price.toFixed(
                        2
                      )}
                    </option>
                  ))}
              </select>
            </div>

            <button
              onClick={runStrategy}
              disabled={loading || stocks.length === 0}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-500 px-5 py-3 font-semibold text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Play size={18} />

              {`Find strongest ${strategy} setup`}
            </button>

            {strategyMessage && (
              <p className="mt-3 rounded-lg border border-blue-500/20 bg-blue-500/[0.06] p-3 text-sm text-blue-200">
                {strategyMessage}
              </p>
            )}
          </section>

          {/* Risk Engine */}
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">

            <div className="mb-6 flex items-center gap-3">
              <Shield
                className="text-emerald-400"
                size={22}
              />

              <div>
                <h2 className="font-semibold">
                  Risk Engine
                </h2>

                <p className="text-xs text-slate-500">
                  Automated position controls
                </p>
              </div>
            </div>

            <div className="space-y-5">

              <div>
                <div className="mb-2 flex justify-between text-xs">
                  <span className="text-slate-400">
                    Maximum Position
                  </span>

                  <span className="font-semibold">
                    {positionPercent}%
                  </span>
                </div>

                <input
                  type="range"
                  min="5"
                  max="25"
                  value={positionPercent}
                  onChange={(event) =>
                    setPositionPercent(
                      Number(
                        event.target
                          .value
                      )
                    )
                  }
                  className="w-full"
                />
              </div>

              <div>
                <div className="mb-2 flex justify-between text-xs">
                  <span className="text-slate-400">
                    Portfolio Risk
                  </span>

                  <span className="font-semibold">
                    {riskPercent}%
                  </span>
                </div>

                <input
                  type="range"
                  min="0.5"
                  max="5"
                  step="0.5"
                  value={riskPercent}
                  onChange={(event) =>
                    setRiskPercent(
                      Number(
                        event.target
                          .value
                      )
                    )
                  }
                  className="w-full"
                />
              </div>

              <div>
                <div className="mb-2 flex justify-between text-xs">
                  <span className="text-slate-400">
                    Stop Loss
                  </span>

                  <span className="font-semibold">
                    {stopLoss}%
                  </span>
                </div>

                <input
                  type="range"
                  min="1"
                  max="10"
                  step="0.5"
                  value={stopLoss}
                  onChange={(event) =>
                    setStopLoss(
                      Number(
                        event.target
                          .value
                      )
                    )
                  }
                  className="w-full"
                />
              </div>

              <div className="rounded-xl bg-[#0b101b] p-4">
                <p className="text-xs text-slate-500">
                  Maximum position value
                </p>

                <p className="mt-1 text-xl font-bold">
                  ₹
                  {maxPosition.toLocaleString(
                    "en-IN"
                  )}
                </p>
              </div>

              <div className="rounded-xl bg-[#0b101b] p-4">
                <p className="text-xs text-slate-500">
                  Maximum risk
                </p>

                <p className="mt-1 text-xl font-bold">
                  ₹
                  {maxRisk.toLocaleString(
                    "en-IN"
                  )}
                </p>
              </div>
            </div>
          </section>
        </div>

        {/* Strategy Output */}
        <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6">

          <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-semibold">
                Strategy Output
              </h2>

              <p className="mt-1 text-sm text-slate-400">
                {selectedStock?.symbol ?? "—"} •{" "}
                {strategy} • Real market data
              </p>
            </div>

            <div className="flex items-center gap-2 rounded-lg bg-blue-500/10 px-3 py-2 text-xs text-blue-300">
              <BrainCircuit size={15} />
              AI Score {selectedStock?.score ?? 0}
            </div>
          </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">

            <div className="rounded-xl bg-[#0b101b] p-5">
              <TrendingUp
                className="mb-3 text-emerald-400"
                size={20}
              />

              <p className="text-xs text-slate-500">
                Signal
              </p>

              <p
                className={`mt-1 text-xl font-bold ${
                  quantSignal === "BUY"
                    ? "text-emerald-400"
                    : quantSignal ===
                      "SELL"
                    ? "text-red-400"
                    : "text-yellow-400"
                }`}
              >
                {quantSignal}
              </p>
            </div>

            <div className="rounded-xl bg-[#0b101b] p-5">
              <Activity
                className="mb-3 text-blue-400"
                size={20}
              />

              <p className="text-xs text-slate-500">
                Signal strength
              </p>

              <p className="mt-1 text-xl font-bold">
                {confidence}%
              </p>
            </div>

            <div className="rounded-xl bg-[#0b101b] p-5">
              <p className="text-xs text-slate-500">
                Suggested Qty
              </p>

              <p className="mt-1 text-xl font-bold">
                {suggestedQuantity}
              </p>

              <p className="mt-1 text-xs text-slate-600">
                risk adjusted
              </p>
            </div>

            <div className="rounded-xl bg-[#0b101b] p-5">
              <p className="text-xs text-slate-500">
                Position Value
              </p>

              <p className="mt-1 text-xl font-bold">
                ₹
                {positionValue.toLocaleString(
                  "en-IN"
                )}
              </p>
            </div>

            <div className="rounded-xl bg-[#0b101b] p-5">
              <p className="text-xs text-slate-500">
                Execution
              </p>

              <p className="mt-1 text-xl font-bold text-blue-400">
                PAPER
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">Suggested paper order</p>
              <p className="mt-1 text-xs text-slate-400">
                {quantSignal === "BUY" && suggestedQuantity > 0
                  ? `${suggestedQuantity} shares • ₹${positionValue.toLocaleString("en-IN", { maximumFractionDigits: 2 })} estimated value • capped by your cash and risk settings`
                  : "A BUY signal with at least one risk-sized share is required."}
              </p>
            </div>
            {selectedStock && quantSignal === "BUY" && suggestedQuantity > 0 ? (
              <Link
                href={`/trade?symbol=${encodeURIComponent(selectedStock.symbol)}&side=BUY&quantity=${suggestedQuantity}`}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-400"
              >
                Review buy order
                <ArrowUpRight size={16} />
              </Link>
            ) : (
              <button
                type="button"
                disabled
                className="shrink-0 rounded-lg border border-white/10 px-4 py-2.5 text-sm text-slate-500"
              >
                No buy order available
              </button>
            )}
          </div>

          <div className="mt-5 rounded-xl border border-white/10 bg-[#0b101b] p-5">

            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">

              <div>
                <p className="text-xs uppercase tracking-wider text-slate-500">
                  AI + Quant Explanation
                </p>

                <p className="mt-2 text-sm leading-6 text-slate-300">
                  {selectedStock?.explanation ?? "Connect the market data API to load a live analysis."}
                  {" "}
                  The {strategy.toLowerCase()} strategy
                  applies a bounded adjustment to today's
                  price-move score. This is a one-session
                  rules signal, not a guarantee or a
                  long-term forecast. Risk controls then
                  determine the maximum simulated position
                  size.
                </p>
              </div>

              <div className="shrink-0 rounded-xl border border-white/10 px-4 py-3">
                <p className="text-xs text-slate-500">
                  Current Price
                </p>

                <p className="mt-1 text-lg font-bold">
                  ₹
                  {(selectedStock?.price ?? 0).toLocaleString(
                    "en-IN",
                    {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    }
                  )}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Top Opportunities */}
        <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6">

          <div className="mb-6">
            <h2 className="text-xl font-semibold">
              Top Quant Opportunities
            </h2>

            <p className="mt-1 text-sm text-slate-400">
              BUY candidates ranked by the selected strategy.
            </p>
          </div>

          {loading ? (
            <div className="py-10 text-center text-sm text-slate-500">
              Loading live market analysis...
            </div>
          ) : stocks.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">
              Live scores are unavailable. Check the API connection, then refresh.
            </div>
          ) : buyOpportunities.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-400">
                No BUY candidates match {strategy} right now. Try another strategy or refresh the feed.
              </div>
            ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              {buyOpportunities.slice(0, 8).map((stock) => (
                  <Link
                    key={stock.symbol}
                    href={`/trade?symbol=${encodeURIComponent(stock.symbol)}&side=BUY&quantity=${suggestedShares(stock.price, availableCash, positionPercent, riskPercent, stopLoss)}`}
                    onClick={() =>
                      setSelectedSymbol(
                        stock.symbol
                      )
                    }
                    className="rounded-xl border border-white/10 bg-[#0b101b] p-4 text-left transition hover:border-emerald-400/30 hover:bg-white/[0.04]"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">
                        {stock.symbol}
                      </span>

                      <span className="rounded-md bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-400">
                        BUY
                      </span>
                    </div>

                    <div className="mt-4 flex items-end justify-between">
                      <div>
                        <p className="text-xs text-slate-500">
                          Strategy score
                        </p>

                        <p className="text-2xl font-bold">
                          {stock.quantScore}
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="text-xs text-slate-500">
                          Change
                        </p>

                        <p className="text-sm font-semibold text-emerald-400">
                          {stock.change_percent > 0 ? "+" : ""}
                          {stock.change_percent.toFixed(
                            2
                          )}
                          %
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
            </div>
          )}
        </section>

        {/* AutoTrader */}
        <section className="mt-6 rounded-2xl border border-violet-500/20 bg-gradient-to-r from-violet-500/10 to-blue-500/5 p-6">

          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">

            <div>
              <div className="flex items-center gap-2">
                <Zap
                  size={20}
                  className="text-violet-300"
                />

                <h2 className="text-xl font-semibold">
                  AI AutoTrader
                </h2>
              </div>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                Scan the live scores, select the top BUY setup for {strategy}, and prepare a risk-sized paper order. You review and submit it on the order ticket.
              </p>
            </div>

            <button
              onClick={findAutoTradeSetup}
              disabled={loading || stocks.length === 0}
              className="rounded-xl border border-violet-400/30 bg-violet-500/15 px-5 py-3 text-sm font-semibold text-violet-200 transition hover:bg-violet-500/25 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Find best paper setup
            </button>
          </div>

          {autoTradeMessage && (
            <div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-slate-300">
              <p>{autoTradeMessage}</p>
              {autoTradeCandidate && suggestedShares(autoTradeCandidate.price, availableCash, positionPercent, riskPercent, stopLoss) > 0 && (
                <Link
                  href={`/trade?symbol=${encodeURIComponent(autoTradeCandidate.symbol)}&side=BUY&quantity=${suggestedShares(autoTradeCandidate.price, availableCash, positionPercent, riskPercent, stopLoss)}`}
                  className="mt-3 inline-flex items-center gap-2 rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-400"
                >
                  Review {autoTradeCandidate.symbol} order
                  <ArrowUpRight size={16} />
                </Link>
              )}
            </div>
          )}
        </section>

        {/* Disclaimer */}
        <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.02] p-4 text-xs leading-5 text-slate-500">
          Quant Lab is an educational paper-trading
          simulator. Signals are generated from
          market-data rules and the INVESTIQ AI scoring
          engine. They are not financial advice and do
          not guarantee investment returns.
        </div>
      </div>
    </main>
  );
}
