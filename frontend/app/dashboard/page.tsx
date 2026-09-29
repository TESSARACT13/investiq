"use client";

import { API_URL, marketWebSocketUrl } from "@/lib/api";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  TrendingUp,
  BriefcaseBusiness,
  Receipt,
  Bot,
  FlaskConical,
  Settings,
  Search,
  Bell,
  Star,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  Activity,
  RefreshCw,
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

  useEffect(() => {
    if (typeof window === "undefined") return;

    const savedCash = localStorage.getItem("investiq_cash");
    const savedHoldings =
      localStorage.getItem("investiq_holdings");

    if (savedCash) {
      const parsedCash = Number(savedCash);

      if (!Number.isNaN(parsedCash)) {
        setCash(parsedCash);
      }
    }

    if (savedHoldings) {
      try {
        const parsed = JSON.parse(savedHoldings);

        if (Array.isArray(parsed)) {
          const normalized = parsed
            .map((holding: any) => ({
              symbol: String(
                holding.symbol ??
                  holding.stockSymbol ??
                  ""
              ).toUpperCase(),
              quantity: Number(
                holding.quantity ??
                  holding.qty ??
                  0
              ),
              avgPrice: Number(
                holding.avgPrice ??
                  holding.averagePrice ??
                  holding.avg_price ??
                  0
              ),
            }))
            .filter(
              (holding) =>
                holding.symbol &&
                holding.quantity > 0
            );

          setHoldings(normalized);
        }
      } catch {
        setHoldings([]);
      }
    }
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

  const navItems = [
    {
      label: "Dashboard",
      icon: LayoutDashboard,
      path: "/dashboard",
    },
    {
      label: "Markets",
      icon: TrendingUp,
      path: "/markets",
    },
    {
      label: "Watchlist",
      icon: Star,
      path: "/watchlist",
    },
    {
      label: "Portfolio",
      icon: BriefcaseBusiness,
      path: "/portfolio",
    },
    {
      label: "Orders",
      icon: Receipt,
      path: "/orders",
    },
    {
      label: "Investments",
      icon: Wallet,
      path: "/investments",
    },
    {
      label: "AI Advisor",
      icon: Bot,
      path: "/advisor",
    },
    {
      label: "Quant Lab",
      icon: FlaskConical,
      path: "/quant",
    },
  ];

  return (
    <main className="min-h-screen bg-[#05070b] text-white">
      <div className="flex min-h-screen">
        {/* SIDEBAR */}
        <aside className="hidden w-64 shrink-0 border-r border-white/10 bg-[#080b11] lg:flex lg:flex-col">
          <div className="border-b border-white/10 px-6 py-6">
            <button
              onClick={() =>
                router.push("/dashboard")
              }
              className="text-left"
            >
              <div className="text-xl font-bold tracking-[0.18em]">
                INVESTIQ
              </div>

              <div className="mt-1 text-[10px] uppercase tracking-[0.25em] text-gray-500">
                Investment Intelligence
              </div>
            </button>
          </div>

          <nav className="flex-1 space-y-1 p-4">
            {navItems.map((item) => {
              const Icon = item.icon;

              return (
                <button
                  key={item.label}
                  onClick={() =>
                    router.push(item.path)
                  }
                  className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm transition ${
                    item.path === "/dashboard"
                      ? "bg-white/[0.08] text-white"
                      : "text-gray-500 hover:bg-white/[0.05] hover:text-white"
                  }`}
                >
                  <Icon size={18} />
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="border-t border-white/10 p-4">
            <button
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm text-gray-500 transition hover:bg-white/[0.05] hover:text-white"
            >
              <Settings size={18} />
              Settings
            </button>
          </div>
        </aside>

        {/* MAIN */}
        <div className="min-w-0 flex-1">
          {/* TOP BAR */}
          <header className="sticky top-0 z-20 border-b border-white/10 bg-[#05070b]/95 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-4 px-5 py-4 lg:px-8">
              <div className="lg:hidden">
                <div className="text-lg font-bold tracking-[0.15em]">
                  INVESTIQ
                </div>
              </div>

              <div className="relative hidden max-w-md flex-1 md:block">
                <Search
                  size={17}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500"
                />

                <input
                  value={search}
                  onChange={(e) =>
                    setSearch(e.target.value)
                  }
                  placeholder="Search stocks..."
                  className="w-full rounded-xl border border-white/10 bg-white/[0.035] py-3 pl-11 pr-4 text-sm text-white outline-none placeholder:text-gray-600 focus:border-blue-500/40"
                />
              </div>

              <div className="flex items-center gap-3">
                <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs sm:flex">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      connected
                        ? "bg-emerald-400"
                        : "bg-yellow-400"
                    }`}
                  />

                  {connected
                    ? "Live Market"
                    : "Last Recorded"}
                </div>

                <button className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5 text-gray-400 hover:text-white">
                  <Bell size={18} />
                </button>
              </div>
            </div>
          </header>

          <div className="px-5 py-7 lg:px-8">
            {/* WELCOME */}
            <div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
              <div>
                <p className="text-sm text-gray-500">
                  Monday, September 28
                </p>

                <h1 className="mt-1 text-3xl font-semibold tracking-tight">
                  Good evening, Hamza
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

            {/* MOBILE NAV */}
            <div className="mt-8 grid grid-cols-4 gap-2 border-t border-white/10 pt-5 lg:hidden">
              <button
                onClick={() =>
                  router.push(
                    "/dashboard"
                  )
                }
                className="flex flex-col items-center gap-1 rounded-xl bg-white/[0.07] p-3 text-xs text-white"
              >
                <LayoutDashboard size={18} />
                Home
              </button>

              <button
                onClick={() =>
                  router.push(
                    "/markets"
                  )
                }
                className="flex flex-col items-center gap-1 rounded-xl p-3 text-xs text-gray-500"
              >
                <TrendingUp size={18} />
                Markets
              </button>

              <button
                onClick={() =>
                  router.push(
                    "/portfolio"
                  )
                }
                className="flex flex-col items-center gap-1 rounded-xl p-3 text-xs text-gray-500"
              >
                <BriefcaseBusiness
                  size={18}
                />
                Portfolio
              </button>

              <button
                onClick={() =>
                  router.push(
                    "/orders"
                  )
                }
                className="flex flex-col items-center gap-1 rounded-xl p-3 text-xs text-gray-500"
              >
                <Receipt size={18} />
                Orders
              </button>
            </div>

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