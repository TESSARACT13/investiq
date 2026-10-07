"use client";

import { API_URL, marketWebSocketUrl } from "@/lib/api";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  TrendingUp,
  BriefcaseBusiness,
  Receipt,
  Bot,
  FlaskConical,
  Search,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  Activity,
} from "lucide-react";

type StockPrice = {
  symbol: string;
  price: number;
  previous_close: number;
  change: number;
  change_percent: number;
};

type Holding = {
  symbol: string;
  quantity: number;
  avgPrice: number;
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

export default function DashboardPage() {
  const router = useRouter();

  const [cash, setCash] = useState(100000);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [prices, setPrices] =
    useState<Record<string, StockPrice>>(FALLBACK_PRICES);

  const [connected, setConnected] = useState(false);
  const [search, setSearch] = useState("");
  const [firstName, setFirstName] = useState("there");

  useEffect(() => {
    let active = true;
    const loadAccount = async () => {
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
          setFirstName(user.user_metadata?.full_name?.split(" ")[0] || user.email?.split("@")[0] || "there");
          return;
        }
      }

      const savedCash = localStorage.getItem("investiq_cash");
      const savedHoldings = localStorage.getItem("investiq_holdings");
      const parsedCash = Number(savedCash ?? 100000);
      if (Number.isFinite(parsedCash)) setCash(parsedCash);
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
    void loadAccount();
    const refresh = () => void loadAccount();
    window.addEventListener("investiq-data-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      active = false;
      window.removeEventListener("investiq-data-updated", refresh);
      window.removeEventListener("storage", refresh);
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

        if (!Array.isArray(data)) return;

        const mapped: Record<string, StockPrice> = {};

        data.forEach((stock: any) => {
          if (!stock?.symbol) return;

          mapped[stock.symbol] = {
            symbol: stock.symbol,
            price: Number(stock.price ?? 0),
            previous_close: Number(
              stock.previous_close ??
                stock.price ??
                0
            ),
            change: Number(stock.change ?? 0),
            change_percent: Number(
              stock.change_percent ?? 0
            ),
          };
        });

        setPrices((previous) => ({
          ...previous,
          ...mapped,
        }));
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

        Object.entries(data).forEach(
          ([symbol, value]: any) => {
            if (!value) return;

            updated[symbol] = {
              symbol,
              price: Number(value.price ?? 0),
              previous_close: Number(
                value.previous_close ??
                  value.price ??
                  0
              ),
              change: Number(value.change ?? 0),
              change_percent: Number(
                value.change_percent ?? 0
              ),
            };
          }
        );

        if (Object.keys(updated).length > 0) {
          setPrices((previous) => ({
            ...previous,
            ...updated,
          }));
        }
      } catch {
        // Ignore invalid websocket data
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

      const currentPrice =
        stock?.price ?? holding.avgPrice;

      const invested =
        holding.quantity * holding.avgPrice;

      const currentValue =
        holding.quantity * currentPrice;

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
          invested > 0
            ? (pnl / invested) * 100
            : 0,
      };
    });

    const totalValue = cash + marketValue;

    const totalPnl =
      marketValue - investedValue;

    const pnlPercent =
      investedValue > 0
        ? (totalPnl / investedValue) * 100
        : 0;

    return {
      enriched,
      marketValue,
      investedValue,
      totalValue,
      totalPnl,
      pnlPercent,
    };
  }, [holdings, prices, cash]);

  const filteredStocks = Object.values(
    prices
  ).filter((stock) =>
    stock.symbol
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  const formatCurrency = (
    value: number | undefined | null
  ) => {
    const safeValue = Number(value ?? 0);

    return `₹${safeValue.toLocaleString(
      "en-IN",
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }
    )}`;
  };

  return (
    <main className="min-h-screen bg-[#05070b] text-white">
      <div className="min-h-screen">
        <div className="min-w-0">
          <div className="px-5 py-7 lg:px-8">
            <div className="relative mb-7 max-w-md md:hidden">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search stocks…" className="w-full rounded-xl border border-white/10 bg-white/[0.035] py-2.5 pl-10 pr-4 text-sm text-white outline-none placeholder:text-gray-500 focus:border-emerald-500/40" />
            </div>
            {/* WELCOME */}
            <div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
              <div>
                <p className="text-sm text-gray-500">
                  {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
                </p>

                <h1 className="mt-1 text-3xl font-semibold tracking-tight">
                  Good to see you, {firstName}
                </h1>

                <p className="mt-2 text-sm text-gray-500">
                  Here's your investment overview.
                </p>
              </div>

              <button
                onClick={() =>
                  router.push("/markets")
                }
                className="flex w-fit items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-gray-200"
              >
                Explore Markets
                <ArrowUpRight size={16} />
              </button>
            </div>

            {/* METRICS */}
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
                <div className="mb-5 flex items-center justify-between">
                  <span className="text-sm text-gray-500">
                    Portfolio Value
                  </span>

                  <Wallet
                    size={18}
                    className="text-blue-400"
                  />
                </div>

                <div className="text-2xl font-semibold">
                  {formatCurrency(
                    portfolio.totalValue
                  )}
                </div>

                <p className="mt-2 text-xs text-gray-600">
                  Cash + investments
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
                <div className="mb-5 flex items-center justify-between">
                  <span className="text-sm text-gray-500">
                    Total P&L
                  </span>

                  {portfolio.totalPnl >= 0 ? (
                    <TrendingUp
                      size={18}
                      className="text-emerald-400"
                    />
                  ) : (
                    <TrendingUp
                      size={18}
                      className="text-red-400"
                    />
                  )}
                </div>

                <div
                  className={`text-2xl font-semibold ${
                    portfolio.totalPnl >= 0
                      ? "text-emerald-400"
                      : "text-red-400"
                  }`}
                >
                  {portfolio.totalPnl >= 0
                    ? "+"
                    : ""}
                  {formatCurrency(
                    portfolio.totalPnl
                  )}
                </div>

                <p
                  className={`mt-2 text-xs ${
                    portfolio.totalPnl >= 0
                      ? "text-emerald-500"
                      : "text-red-500"
                  }`}
                >
                  {portfolio.pnlPercent >= 0
                    ? "+"
                    : ""}
                  {portfolio.pnlPercent.toFixed(
                    2
                  )}
                  %
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
                <div className="mb-5 flex items-center justify-between">
                  <span className="text-sm text-gray-500">
                    Available Cash
                  </span>

                  <Wallet
                    size={18}
                    className="text-violet-400"
                  />
                </div>

                <div className="text-2xl font-semibold">
                  {formatCurrency(cash)}
                </div>

                <p className="mt-2 text-xs text-gray-600">
                  Paper trading balance
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
                <div className="mb-5 flex items-center justify-between">
                  <span className="text-sm text-gray-500">
                    Holdings
                  </span>

                  <BriefcaseBusiness
                    size={18}
                    className="text-orange-400"
                  />
                </div>

                <div className="text-2xl font-semibold">
                  {holdings.length}
                </div>

                <p className="mt-2 text-xs text-gray-600">
                  Active positions
                </p>
              </div>
            </section>

            {/* CONTENT GRID */}
            <div className="mt-8 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
              {/* HOLDINGS */}
              <section className="rounded-2xl border border-white/10 bg-white/[0.025]">
                <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
                  <div>
                    <h2 className="font-semibold">
                      Your Holdings
                    </h2>

                    <p className="mt-1 text-xs text-gray-600">
                      Current paper positions
                    </p>
                  </div>

                  <button
                    onClick={() =>
                      router.push(
                        "/portfolio"
                      )
                    }
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    View Portfolio →
                  </button>
                </div>

                {portfolio.enriched.length ===
                0 ? (
                  <div className="px-6 py-14 text-center">
                    <BriefcaseBusiness
                      size={28}
                      className="mx-auto text-gray-600"
                    />

                    <p className="mt-4 text-sm text-gray-400">
                      No holdings yet
                    </p>

                    <button
                      onClick={() =>
                        router.push(
                          "/markets"
                        )
                      }
                      className="mt-4 rounded-lg bg-white px-4 py-2 text-xs font-semibold text-black"
                    >
                      Start Trading
                    </button>
                  </div>
                ) : (
                  <div className="divide-y divide-white/[0.06]">
                    {portfolio.enriched.map(
                      (holding) => (
                        <div
                          key={
                            holding.symbol
                          }
                          className="flex items-center justify-between gap-4 px-6 py-5"
                        >
                          <div>
                            <div className="font-semibold">
                              {
                                holding.symbol
                              }
                            </div>

                            <div className="mt-1 text-xs text-gray-600">
                              {
                                holding.quantity
                              }{" "}
                              shares · Avg{" "}
                              {formatCurrency(
                                holding.avgPrice
                              )}
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="font-medium">
                              {formatCurrency(
                                holding.currentValue
                              )}
                            </div>

                            <div
                              className={`mt-1 flex items-center justify-end gap-1 text-xs ${
                                holding.pnl >=
                                0
                                  ? "text-emerald-400"
                                  : "text-red-400"
                              }`}
                            >
                              {holding.pnl >=
                              0 ? (
                                <ArrowUpRight
                                  size={
                                    13
                                  }
                                />
                              ) : (
                                <ArrowDownRight
                                  size={
                                    13
                                  }
                                />
                              )}

                              {holding.pnl >=
                              0
                                ? "+"
                                : ""}
                              {formatCurrency(
                                holding.pnl
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                )}
              </section>

              {/* MARKET OVERVIEW */}
              <section className="rounded-2xl border border-white/10 bg-white/[0.025]">
                <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
                  <div>
                    <h2 className="font-semibold">
                      Market Overview
                    </h2>

                    <p className="mt-1 text-xs text-gray-600">
                      Live market intelligence
                    </p>
                  </div>

                  <Activity
                    size={18}
                    className="text-blue-400"
                  />
                </div>

                <div className="divide-y divide-white/[0.06]">
                  {filteredStocks.map(
                    (stock) => (
                      <button
                        key={
                          stock.symbol
                        }
                        onClick={() =>
                          router.push(
                            `/stock/${stock.symbol}`
                          )
                        }
                        className="flex w-full items-center justify-between px-6 py-4 text-left transition hover:bg-white/[0.025]"
                      >
                        <div>
                          <div className="font-medium">
                            {
                              stock.symbol
                            }
                          </div>

                          <div className="mt-1 text-xs text-gray-600">
                            NSE Equity
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="font-medium">
                            {formatCurrency(
                              stock.price
                            )}
                          </div>

                          <div
                            className={`mt-1 text-xs ${
                              stock.change_percent >=
                              0
                                ? "text-emerald-400"
                                : "text-red-400"
                            }`}
                          >
                            {stock.change_percent >=
                            0
                              ? "+"
                              : ""}
                            {stock.change_percent.toFixed(
                              2
                            )}
                            %
                          </div>
                        </div>
                      </button>
                    )
                  )}
                </div>
              </section>
            </div>

            {/* QUICK ACTIONS */}
            <section className="mt-8">
              <div className="mb-4">
                <h2 className="font-semibold">
                  Quick Access
                </h2>

                <p className="mt-1 text-xs text-gray-600">
                  Continue exploring INVESTIQ
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <button
                  onClick={() =>
                    router.push(
                      "/portfolio"
                    )
                  }
                  className="group rounded-2xl border border-white/10 bg-white/[0.025] p-5 text-left transition hover:border-blue-500/30 hover:bg-white/[0.045]"
                >
                  <BriefcaseBusiness
                    size={21}
                    className="text-blue-400"
                  />

                  <h3 className="mt-4 font-medium">
                    Portfolio
                  </h3>

                  <p className="mt-1 text-xs text-gray-600">
                    Track your investments
                  </p>
                </button>

                <button
                  onClick={() =>
                    router.push(
                      "/orders"
                    )
                  }
                  className="group rounded-2xl border border-white/10 bg-white/[0.025] p-5 text-left transition hover:border-violet-500/30 hover:bg-white/[0.045]"
                >
                  <Receipt
                    size={21}
                    className="text-violet-400"
                  />

                  <h3 className="mt-4 font-medium">
                    Order History
                  </h3>

                  <p className="mt-1 text-xs text-gray-600">
                    Review your trades
                  </p>
                </button>

                <button
                  onClick={() =>
                    router.push(
                      "/advisor"
                    )
                  }
                  className="group rounded-2xl border border-white/10 bg-white/[0.025] p-5 text-left transition hover:border-blue-500/30 hover:bg-white/[0.045]"
                >
                  <Bot
                    size={21}
                    className="text-blue-400"
                  />

                  <h3 className="mt-4 font-medium">
                    AI Advisor
                  </h3>

                  <p className="mt-1 text-xs text-gray-600">
                    Personalized intelligence
                  </p>
                </button>

                <button
                  onClick={() =>
                    router.push(
                      "/quant"
                    )
                  }
                  className="group rounded-2xl border border-white/10 bg-white/[0.025] p-5 text-left transition hover:border-emerald-500/30 hover:bg-white/[0.045]"
                >
                  <FlaskConical
                    size={21}
                    className="text-emerald-400"
                  />

                  <h3 className="mt-4 font-medium">
                    Quant Lab
                  </h3>

                  <p className="mt-1 text-xs text-gray-600">
                    Build trading strategies
                  </p>
                </button>
              </div>
            </section>

            {/* FOOTER */}
            <div className="mt-10 border-t border-white/10 pt-6 text-center text-xs text-gray-700">
              INVESTIQ · Real-Time AI Investment
              Intelligence · Paper Trading Platform
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
