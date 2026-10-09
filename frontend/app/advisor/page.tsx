"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { API_URL } from "@/lib/api";
import {
  ArrowDown,
  ArrowUp,
  Brain,
  ChevronRight,
  Loader2,
  RefreshCw,
  Sparkles,
  TrendingDown,
  ShieldCheck,
  Target,
  Zap,
} from "lucide-react";

type AIScore = {
  symbol: string;
  name: string;
  price: number;
  change: number;
  change_percent: number;
  score: number;
  signal: "BUY" | "HOLD" | "SELL" | string;
  confidence: number;
  explanation: string;
};

const FALLBACK_NAMES: Record<string, string> = {
  RELIANCE: "Reliance Industries",
  TCS: "Tata Consultancy Services",
  INFY: "Infosys",
  HDFCBANK: "HDFC Bank",
};

function formatPrice(value: number) {
  return `₹${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function normalizeScore(item: any): AIScore {
  const symbol = String(
    item?.symbol ??
      item?.tradingsymbol ??
      item?.stock ??
      ""
  ).toUpperCase();

  return {
    symbol,

    name:
      item?.name ??
      item?.company_name ??
      FALLBACK_NAMES[symbol] ??
      symbol,

    price: Number(
      item?.price ??
        item?.ltp ??
        item?.last_price ??
        0
    ),

    change: Number(
      item?.change ??
        item?.price_change ??
        0
    ),

    change_percent: Number(
      item?.change_percent ??
        item?.changePercent ??
        item?.percent_change ??
        0
    ),

    score: Math.max(
      0,
      Math.min(100, Number(item?.score ?? 0))
    ),

    signal: String(
      item?.signal ??
        item?.recommendation ??
        "HOLD"
    ).toUpperCase(),

    confidence: Math.max(
      0,
      Math.min(
        100,
        Number(item?.confidence ?? 0)
      )
    ),

    explanation:
      item?.explanation ??
      item?.reason ??
      "AI analysis is based on current market conditions.",
  };
}

export default function AdvisorPage() {
  const [scores, setScores] = useState<AIScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [quoteSource, setQuoteSource] = useState<"live" | "last_close" | "fallback" | "unknown">("unknown");

  const loadScores = useCallback(
    async (showRefresh = false) => {
      if (showRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      try {
        const response = await fetch(
          `${API_URL}/ai/scores`,
          {
            cache: "no-store",
          }
        );

        if (!response.ok) {
          throw new Error(
            `AI endpoint returned ${response.status}`
          );
        }

        const data = await response.json();

        setQuoteSource(data?.source === "live" ? "live" : data?.source === "last_close" ? "last_close" : data?.source === "fallback" ? "fallback" : "unknown");

        console.log("INVESTIQ AI response:", data);

        /*
          Backend response:

          {
            "status": "success",
            "count": 4,
            "stocks": [...]
          }

          So we specifically read data.stocks.
        */

        const sourceScores = Array.isArray(data)
          ? data
          : data?.stocks ?? data?.scores ?? data?.data;
        const rawScores = Array.isArray(sourceScores)
          ? sourceScores
          : sourceScores && typeof sourceScores === "object"
            ? Object.values(sourceScores)
            : [];

        const normalized = rawScores
          .map((item: any) => normalizeScore(item))
          .filter(
            (item: AIScore) =>
              item.symbol.length > 0
          );

        setScores(normalized);

        if (normalized.length === 0) {
          setError(
            "The AI backend responded, but no stock scores were returned."
          );
        }
      } catch (err) {
        console.error(
          "INVESTIQ AI Advisor error:",
          err
        );

        setScores([]);

        setError(
          `Unable to load advisor data from ${API_URL}. Check that the FastAPI backend is running and reachable.`
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    loadScores();
  }, [loadScores]);

  const averageScore = useMemo(() => {
    if (!scores.length) {
      return 0;
    }

    return Math.round(
      scores.reduce(
        (total, item) =>
          total + item.score,
        0
      ) / scores.length
    );
  }, [scores]);

  const buyCount = useMemo(() => {
    return scores.filter(
      (item) => item.signal === "BUY"
    ).length;
  }, [scores]);

  const holdCount = useMemo(() => {
    return scores.filter(
      (item) => item.signal === "HOLD"
    ).length;
  }, [scores]);

  const sellCount = useMemo(() => {
    return scores.filter(
      (item) => item.signal === "SELL"
    ).length;
  }, [scores]);

  const sortedScores = useMemo(() => {
    return [...scores].sort(
      (a, b) => b.score - a.score
    );
  }, [scores]);

  return (
    <main className="min-h-screen bg-[#05070d] text-white">
      <div className="mx-auto max-w-[1400px] px-4 pb-12 pt-6 sm:px-6 lg:px-8">

        {/* Header */}
        <header className="mb-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">

            <div>
              <div className="mb-3 flex items-center gap-2">
                <div className="rounded-xl border border-violet-500/20 bg-violet-500/10 p-2.5">
                  <Brain
                    size={21}
                    className="text-violet-400"
                  />
                </div>

                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
                  INVESTIQ Intelligence
                </span>
              </div>

              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                AI Investment Advisor
              </h1>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                A transparent momentum screen based on the latest quotes available to your account.
              </p>
            </div>

            <button
              onClick={() => loadScores(true)}
              disabled={refreshing}
              className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-300 transition hover:bg-white/[0.08] hover:text-white disabled:opacity-50"
            >
              <RefreshCw
                size={16}
                className={
                  refreshing
                    ? "animate-spin"
                    : ""
                }
              />

              Refresh AI
            </button>
          </div>
        </header>

        {/* AI Status */}
        <section className="mb-6 overflow-hidden rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/[0.10] via-blue-500/[0.05] to-transparent">
          <div className="grid gap-6 p-6 lg:grid-cols-[1fr_auto] lg:items-center">

            <div>
              <div className="mb-3 flex items-center gap-2">
                <Sparkles
                  size={18}
                  className="text-violet-400"
                />

                <span className="text-sm font-semibold">
                  AI Market Intelligence
                </span>

                <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-400">
                  {quoteSource === "live" ? "LIVE QUOTES" : quoteSource === "last_close" ? "LAST TRADE" : quoteSource === "fallback" ? "SAMPLE QUOTES" : "QUOTE STATUS"}
                </span>
              </div>

              <h2 className="text-xl font-semibold">
                Current market intelligence
              </h2>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                Signals use the latest available market data. Last-traded prices are marked after hours; treat every signal as a screening hint, not personalized advice.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard
                label="Stocks"
                value={String(scores.length)}
              />

              <StatCard
                label="Avg Score"
                value={
                  scores.length
                    ? String(averageScore)
                    : "—"
                }
              />

              <StatCard
                label="Buy"
                value={String(buyCount)}
              />

              <StatCard
                label="Hold"
                value={String(holdCount)}
              />
            </div>
          </div>
        </section>

        {!loading && scores.length > 0 && quoteSource === "last_close" && <div role="status" className="mb-5 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs leading-5 text-slate-500">Market is closed. Signals use each stock’s latest recorded trade and will refresh when live trading resumes.</div>}

        {/* Loading */}
        {loading && (
          <div className="flex min-h-[360px] items-center justify-center rounded-2xl border border-white/10 bg-[#090c14]">
            <div className="text-center">
              <Loader2
                size={30}
                className="mx-auto mb-4 animate-spin text-violet-400"
              />

              <p className="text-sm font-medium text-slate-300">
                Running AI market analysis...
              </p>

              <p className="mt-2 text-xs text-slate-600">
                Fetching live scores from INVESTIQ backend
              </p>
            </div>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <section className="mb-6 rounded-2xl border border-red-500/20 bg-red-500/[0.05] p-6">
            <div className="flex gap-4">

              <div className="rounded-xl bg-red-500/10 p-3">
                <Zap
                  size={20}
                  className="text-red-400"
                />
              </div>

              <div>
                <h2 className="font-semibold text-red-300">
                  AI engine unavailable
                </h2>

                <p className="mt-2 text-sm leading-6 text-slate-500">
                  {error}
                </p>

                <button
                  onClick={() =>
                    loadScores(true)
                  }
                  className="mt-4 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-xs text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
                >
                  Try again
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Scores */}
        {!loading && scores.length > 0 && (
          <>
            <section className="mb-6">

              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">
                    AI Stock Signals
                  </h2>

                  <p className="mt-1 text-xs text-slate-600">
                    Sorted by AI score
                  </p>
                </div>

                <div className="text-xs text-slate-600">
                  {scores.length} analyzed
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {sortedScores.map((item) => (
                  <AIScoreCard
                    key={item.symbol}
                    item={item}
                    allowPaperTrade={quoteSource === "live" || quoteSource === "last_close"}
                  />
                ))}
              </div>
            </section>

            {/* Portfolio Intelligence */}
            <section className="grid gap-4 md:grid-cols-3">

              <InsightCard
                icon={
                  <Target
                    size={19}
                    className="text-emerald-400"
                  />
                }
                title="Buy Signals"
                value={buyCount}
                description="Stocks currently receiving a BUY signal from the AI engine."
              />

              <InsightCard
                icon={
                  <ShieldCheck
                    size={19}
                    className="text-amber-400"
                  />
                }
                title="Hold Signals"
                value={holdCount}
                description="Stocks where current conditions remain relatively neutral."
              />

              <InsightCard
                icon={
                  <TrendingDown
                    size={19}
                    className="text-red-400"
                  />
                }
                title="Sell Signals"
                value={sellCount}
                description="Stocks currently receiving a SELL signal from the AI engine."
              />
            </section>
          </>
        )}

        {/* Disclaimer */}
        <div className="mt-8 rounded-xl border border-white/5 bg-white/[0.02] p-4 text-center text-xs leading-5 text-slate-600">
          AI scores are generated from market data and
          quantitative rules. They are educational signals,
          not financial advice or guarantees of future
          performance.
        </div>
      </div>
    </main>
  );
}

function AIScoreCard({
  item,
  allowPaperTrade,
}: {
  item: AIScore;
  allowPaperTrade: boolean;
}) {
  const isPositive =
    item.change_percent >= 0;

  const signal =
    item.signal.toUpperCase();

  const signalStyle =
    signal === "BUY"
      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
      : signal === "SELL"
        ? "border-red-500/20 bg-red-500/10 text-red-400"
        : "border-amber-500/20 bg-amber-500/10 text-amber-400";

  const scoreStyle =
    item.score >= 70
      ? "text-emerald-400"
      : item.score >= 40
        ? "text-amber-400"
        : "text-red-400";

  return (
    <div className="group rounded-2xl border border-white/10 bg-[#090c14] p-5 transition hover:border-white/20 hover:bg-[#0b0f18]">

      {/* Top */}
      <div className="mb-5 flex items-start justify-between gap-4">

        <div>
          <div className="flex items-center gap-2">

            <h3 className="text-lg font-bold">
              {item.symbol}
            </h3>

            <span
              className={`rounded-full border px-2 py-1 text-[10px] font-bold ${signalStyle}`}
            >
              {signal}
            </span>
          </div>

          <p className="mt-1 text-xs text-slate-500">
            {item.name}
          </p>
        </div>

        <div className="text-right">
          <p className="text-lg font-semibold">
            {formatPrice(item.price)}
          </p>

          <p
            className={`mt-1 flex items-center justify-end gap-1 text-xs ${
              isPositive
                ? "text-emerald-400"
                : "text-red-400"
            }`}
          >
            {isPositive ? (
              <ArrowUp size={12} />
            ) : (
              <ArrowDown size={12} />
            )}

            {isPositive ? "+" : ""}
            {item.change_percent.toFixed(2)}%
          </p>
        </div>
      </div>

      {/* Score */}
      <div className="mb-5 flex items-center gap-5">

        <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/20">
          <div className="text-center">

            <div
              className={`text-3xl font-bold ${scoreStyle}`}
            >
              {item.score}
            </div>

            <div className="text-[9px] uppercase tracking-widest text-slate-600">
              score
            </div>
          </div>
        </div>

        <div className="min-w-0 flex-1">

          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="text-slate-500">
              Signal strength
            </span>

            <span className="font-semibold text-slate-300">
              {item.confidence}%
            </span>
          </div>

          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className={`h-full rounded-full transition-all ${
                item.score >= 70
                  ? "bg-emerald-400"
                  : item.score >= 40
                    ? "bg-amber-400"
                    : "bg-red-400"
              }`}
              style={{
                width: `${Math.max(
                  0,
                  Math.min(
                    100,
                    item.confidence
                  )
                )}%`,
              }}
            />
          </div>

          <p className="mt-3 text-xs leading-5 text-slate-500">
            {item.explanation}
          </p>
        </div>
      </div>

      {/* Bottom */}
      <div className="flex items-center justify-between border-t border-white/5 pt-4">

        <div className="flex items-center gap-2 text-xs text-slate-600">
          <Sparkles size={13} />
          Rule based signal
        </div>

        <div className="flex items-center gap-3">
        <Link
          href={`/stock/${item.symbol}`}
          className="flex items-center gap-1 text-xs font-medium text-blue-400 transition hover:text-blue-300"
        >
          View stock
          <ChevronRight size={14} />
        </Link>
        {signal === "BUY" && allowPaperTrade && (
          <Link
            href={`/trade?symbol=${encodeURIComponent(item.symbol)}&side=BUY`}
            className="flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-400"
          >
            Paper buy
            <ChevronRight size={14} />
          </Link>
        )}
        {signal === "BUY" && !allowPaperTrade && <span className="self-center text-[10px] text-amber-300">Connect live quotes to paper trade</span>}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">

      <p className="text-[10px] uppercase tracking-wider text-slate-600">
        {label}
      </p>

      <p className="mt-1 text-xl font-bold">
        {value}
      </p>
    </div>
  );
}

function InsightCard({
  icon,
  title,
  value,
  description,
}: {
  icon: ReactNode;
  title: string;
  value: number;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#090c14] p-5">

      <div className="mb-4 flex items-center justify-between">

        <div className="rounded-xl bg-white/[0.04] p-2.5">
          {icon}
        </div>

        <span className="text-2xl font-bold">
          {value}
        </span>
      </div>

      <h3 className="text-sm font-semibold">
        {title}
      </h3>

      <p className="mt-2 text-xs leading-5 text-slate-600">
        {description}
      </p>
    </div>
  );
}
