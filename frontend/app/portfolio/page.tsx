"use client";

import { API_URL, marketWebSocketUrl } from "@/lib/api";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import {
  ArrowLeft,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  ShoppingCart,
} from "lucide-react";

type Holding = {
  symbol: string;
  quantity: number;
  avgPrice: number;
};

type StockPrice = {
  symbol: string;
  price: number;
  previous_close: number;
  change: number;
  change_percent: number;
};

const FALLBACK_PRICES: Record<string, StockPrice> = {
  RELIANCE: {
    symbol: "RELIANCE",
    price: 1226,
    previous_close: 1219.2,
    change: 6.8,
    change_percent: 0.56,
  },
  TCS: {
    symbol: "TCS",
    price: 2082,
    previous_close: 2087,
    change: -5,
    change_percent: -0.24,
  },
  INFY: {
    symbol: "INFY",
    price: 1000.2,
    previous_close: 1014.5,
    change: -14.3,
    change_percent: -1.41,
  },
  HDFCBANK: {
    symbol: "HDFCBANK",
    price: 735.6,
    previous_close: 728.9,
    change: 6.7,
    change_percent: 0.92,
  },
};

export default function PortfolioPage() {
  const router = useRouter();

  const [cash, setCash] = useState(100000);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [prices, setPrices] =
    useState<Record<string, StockPrice>>(FALLBACK_PRICES);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let active = true;
    const loadPortfolio = async () => {
      if (isSupabaseConfigured) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const [walletResult, holdingResult] = await Promise.all([
            supabase.from("wallets").select("balance").eq("user_id", user.id).maybeSingle(),
            supabase.from("holdings").select("symbol,quantity,average_price").eq("user_id", user.id),
          ]);
          if (!active) return;
          if (walletResult.data) setCash(Number(walletResult.data.balance));
          if (holdingResult.data) {
            setHoldings(holdingResult.data.map((holding) => ({
              symbol: holding.symbol,
              quantity: Number(holding.quantity),
              avgPrice: Number(holding.average_price),
            })));
          }
          return;
        }
      }

      const savedCash = localStorage.getItem("investiq_cash");
      const savedHoldings = localStorage.getItem("investiq_holdings");
      const cashValue = Number(savedCash ?? 100000);
      if (Number.isFinite(cashValue)) setCash(cashValue);
      try {
        const parsed: unknown = JSON.parse(savedHoldings ?? "[]");
        if (Array.isArray(parsed)) {
          setHoldings(parsed.map((holding: any) => ({
            symbol: String(holding.symbol ?? holding.stockSymbol ?? "").toUpperCase(),
            quantity: Number(holding.quantity ?? holding.qty ?? 0),
            avgPrice: Number(holding.avgPrice ?? holding.averagePrice ?? holding.avg_price ?? 0),
          })).filter((holding) => holding.symbol && holding.quantity > 0));
        }
      } catch {
        setHoldings([]);
      }
    };
    void loadPortfolio();
    const refresh = () => void loadPortfolio();
    window.addEventListener("storage", refresh);
    window.addEventListener("investiq-data-updated", refresh);
    return () => {
      active = false;
      window.removeEventListener("storage", refresh);
      window.removeEventListener("investiq-data-updated", refresh);
    };
  }, []);

  useEffect(() => {
    async function loadMarket() {
      try {
        const response = await fetch(
          `${API_URL}/market/overview`
        );

        if (!response.ok) return;

        const data = await response.json();

        if (Array.isArray(data)) {
          const mapped: Record<string, StockPrice> = {};

          data.forEach((stock) => {
            if (!stock?.symbol || !stock?.price) return;

            mapped[stock.symbol] = {
              symbol: stock.symbol,
              price: Number(stock.price),
              previous_close: Number(
                stock.previous_close ?? stock.price
              ),
              change: Number(stock.change ?? 0),
              change_percent: Number(stock.change_percent ?? 0),
            };
          });

          setPrices((previous) => ({
            ...previous,
            ...mapped,
          }));
        }
      } catch {
        // Keep fallback prices
      }
    }

    loadMarket();
  }, []);

  useEffect(() => {
    const ws = new WebSocket(
      marketWebSocketUrl()
    );

    ws.onopen = () => {
      setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (!data) return;

        const updated: Record<string, StockPrice> = {};

        Object.entries(data).forEach(([symbol, value]: any) => {
          if (!value?.price) return;

          updated[symbol] = {
            symbol,
            price: Number(value.price),
            previous_close: Number(
              value.previous_close ?? value.price
            ),
            change: Number(value.change ?? 0),
            change_percent: Number(value.change_percent ?? 0),
          };
        });

        if (Object.keys(updated).length > 0) {
          setPrices((previous) => ({
            ...previous,
            ...updated,
          }));
        }
      } catch {
        // Ignore malformed websocket messages
      }
    };

    ws.onclose = () => {
      setConnected(false);
    };

    ws.onerror = () => {
      setConnected(false);
    };

    return () => {
      ws.close();
    };
  }, []);

  const portfolio = useMemo(() => {
    let marketValue = 0;
    let investedValue = 0;

    const enriched = holdings.map((holding) => {
      const stock = prices[holding.symbol];

      const currentPrice = stock?.price ?? holding.avgPrice;

      const invested = holding.quantity * holding.avgPrice;
      const currentValue = holding.quantity * currentPrice;
      const pnl = currentValue - invested;

      marketValue += currentValue;
      investedValue += invested;

      return {
        ...holding,
        currentPrice,
        invested,
        currentValue,
        pnl,
        pnlPercent:
          invested > 0 ? (pnl / invested) * 100 : 0,
      };
    });

    const totalValue = cash + marketValue;
    const totalPnl = marketValue - investedValue;

    return {
      enriched,
      marketValue,
      investedValue,
      totalValue,
      totalPnl,
      pnlPercent:
        investedValue > 0
          ? (totalPnl / investedValue) * 100
          : 0,
    };
  }, [holdings, prices, cash]);

  const formatCurrency = (value: number | undefined | null) => {
    const safeValue = Number(value ?? 0);

    return `₹${safeValue.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  return (
    <main className="min-h-screen bg-[#05070b] text-white">
      {/* HEADER */}
      <header className="border-b border-white/10 bg-[#080b11]/95">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/dashboard")}
              className="rounded-xl border border-white/10 bg-white/[0.04] p-2.5 transition hover:bg-white/[0.08]"
            >
              <ArrowLeft size={19} />
            </button>

            <div>
              <h1 className="text-xl font-semibold tracking-tight">
                Portfolio
              </h1>
              <p className="text-sm text-gray-500">
                Your investment performance
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs">
            <span
              className={`h-2 w-2 rounded-full ${
                connected
                  ? "bg-emerald-400"
                  : "bg-yellow-400"
              }`}
            />
            {connected ? "Live Market" : "Last Recorded"}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-8">
        {/* TOP METRICS */}
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-6">
            <div className="mb-5 flex items-center justify-between">
              <span className="text-sm text-gray-400">
                Portfolio Value
              </span>

              <div className="rounded-xl bg-blue-500/10 p-2.5 text-blue-400">
                <Wallet size={19} />
              </div>
            </div>

            <div className="text-2xl font-semibold">
              {formatCurrency(portfolio.totalValue)}
            </div>

            <p className="mt-2 text-xs text-gray-500">
              Cash + investments
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-6">
            <div className="mb-5 flex items-center justify-between">
              <span className="text-sm text-gray-400">
                Invested Value
              </span>

              <div className="rounded-xl bg-violet-500/10 p-2.5 text-violet-400">
                <TrendingUp size={19} />
              </div>
            </div>

            <div className="text-2xl font-semibold">
              {formatCurrency(portfolio.investedValue)}
            </div>

            <p className="mt-2 text-xs text-gray-500">
              Total capital invested
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-6">
            <div className="mb-5 flex items-center justify-between">
              <span className="text-sm text-gray-400">
                Total P&L
              </span>

              <div
                className={`rounded-xl p-2.5 ${
                  portfolio.totalPnl >= 0
                    ? "bg-emerald-500/10 text-emerald-400"
                    : "bg-red-500/10 text-red-400"
                }`}
              >
                {portfolio.totalPnl >= 0 ? (
                  <TrendingUp size={19} />
                ) : (
                  <TrendingDown size={19} />
                )}
              </div>
            </div>

            <div
              className={`text-2xl font-semibold ${
                portfolio.totalPnl >= 0
                  ? "text-emerald-400"
                  : "text-red-400"
              }`}
            >
              {portfolio.totalPnl >= 0 ? "+" : ""}
              {formatCurrency(portfolio.totalPnl)}
            </div>

            <p
              className={`mt-2 text-xs ${
                portfolio.totalPnl >= 0
                  ? "text-emerald-400"
                  : "text-red-400"
              }`}
            >
              {portfolio.pnlPercent >= 0 ? "+" : ""}
              {portfolio.pnlPercent.toFixed(2)}%
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-6">
            <div className="mb-5 flex items-center justify-between">
              <span className="text-sm text-gray-400">
                Available Cash
              </span>

              <div className="rounded-xl bg-emerald-500/10 p-2.5 text-emerald-400">
                <Wallet size={19} />
              </div>
            </div>

            <div className="text-2xl font-semibold">
              {formatCurrency(cash)}
            </div>

            <p className="mt-2 text-xs text-gray-500">
              Available for paper trading
            </p>
          </div>
        </section>

        {/* HOLDINGS */}
        <section className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">
                Holdings
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Your current paper investments
              </p>
            </div>

            <button
              onClick={() => window.location.reload()}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-gray-300 transition hover:bg-white/[0.08]"
            >
              <RefreshCw size={15} />
              Refresh
            </button>
          </div>

          {portfolio.enriched.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.025] px-6 py-16 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-400">
                <ShoppingCart size={24} />
              </div>

              <h3 className="text-lg font-medium">
                No holdings yet
              </h3>

              <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
                Start paper trading to build your INVESTIQ
                portfolio.
              </p>

              <button
                onClick={() => router.push("/markets")}
                className="mt-6 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-gray-200"
              >
                Explore Markets
              </button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[850px]">
                  <thead>
                    <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wider text-gray-500">
                      <th className="px-6 py-4">
                        Asset
                      </th>
                      <th className="px-6 py-4">
                        Quantity
                      </th>
                      <th className="px-6 py-4">
                        Avg Price
                      </th>
                      <th className="px-6 py-4">
                        LTP
                      </th>
                      <th className="px-6 py-4">
                        Market Value
                      </th>
                      <th className="px-6 py-4">
                        P&L
                      </th>
                      <th className="px-6 py-4 text-right">
                        Action
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {portfolio.enriched.map((holding) => (
                      <tr
                        key={holding.symbol}
                        className="border-b border-white/[0.06] last:border-0 hover:bg-white/[0.025]"
                      >
                        <td className="px-6 py-5">
                          <div className="font-semibold">
                            {holding.symbol}
                          </div>
                          <div className="mt-1 text-xs text-gray-500">
                            NSE Equity
                          </div>
                        </td>

                        <td className="px-6 py-5 text-sm">
                          {holding.quantity}
                        </td>

                        <td className="px-6 py-5 text-sm">
                          {formatCurrency(
                            holding.avgPrice
                          )}
                        </td>

                        <td className="px-6 py-5 text-sm font-medium">
                          {formatCurrency(
                            holding.currentPrice
                          )}
                        </td>

                        <td className="px-6 py-5 text-sm">
                          {formatCurrency(
                            holding.currentValue
                          )}
                        </td>

                        <td className="px-6 py-5">
                          <div
                            className={`flex items-center gap-1 text-sm font-medium ${
                              holding.pnl >= 0
                                ? "text-emerald-400"
                                : "text-red-400"
                            }`}
                          >
                            {holding.pnl >= 0 ? (
                              <ArrowUpRight size={15} />
                            ) : (
                              <ArrowDownRight size={15} />
                            )}

                            {holding.pnl >= 0 ? "+" : ""}
                            {formatCurrency(holding.pnl)}
                          </div>

                          <div
                            className={`mt-1 text-xs ${
                              holding.pnl >= 0
                                ? "text-emerald-500"
                                : "text-red-500"
                            }`}
                          >
                            {holding.pnlPercent >= 0
                              ? "+"
                              : ""}
                            {holding.pnlPercent.toFixed(2)}
                            %
                          </div>
                        </td>

                        <td className="px-6 py-5 text-right">
                          <button
                            onClick={() =>
                              router.push(
                                `/trade?symbol=${holding.symbol}&side=SELL`
                              )
                            }
                            className="rounded-lg border border-white/10 px-4 py-2 text-xs font-medium text-gray-300 transition hover:bg-white/[0.08]"
                          >
                            Sell
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {/* FOOTER INFO */}
        <section className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-6">
            <h3 className="font-semibold">
              Paper Trading Portfolio
            </h3>

            <p className="mt-2 text-sm leading-6 text-gray-500">
              This portfolio uses virtual money. No real
              trades or real funds are involved.
            </p>
          </div>

          <div className="rounded-2xl border border-blue-500/10 bg-blue-500/[0.035] p-6">
            <h3 className="font-semibold text-blue-300">
              INVESTIQ Intelligence
            </h3>

            <p className="mt-2 text-sm leading-6 text-gray-500">
              Your portfolio will later connect with AI
              scoring, personalized recommendations and
              quantitative strategies.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
