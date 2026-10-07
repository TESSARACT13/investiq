"use client";

import { API_URL, marketWebSocketUrl } from "@/lib/api";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import {
  ArrowLeft,
  Star,
  ArrowUpRight,
  ArrowDownRight,
  Search,
  Plus,
  X,
} from "lucide-react";

type Stock = {
  symbol: string;
  price: number;
  previous_close: number;
  change: number;
  change_percent: number;
};

const FALLBACK: Record<string, Stock> = {
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

export default function WatchlistPage() {
  const router = useRouter();

  const [stocks, setStocks] =
    useState<Record<string, Stock>>(FALLBACK);

  const [watchlist, setWatchlist] =
    useState<string[]>([]);

  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [watchlistError, setWatchlistError] = useState("");
  const [watchlistLoaded, setWatchlistLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    const loadWatchlist = async () => {
      if (isSupabaseConfigured) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data, error } = await supabase.from("watchlist_items").select("symbol").eq("user_id", user.id).order("created_at");
          if (!active) return;
          if (error) {
            setWatchlistError(`${error.message} Run supabase/schema.sql to enable saved watchlists.`);
            setWatchlistLoaded(true);
            return;
          }
          setWatchlist((data ?? []).map((item) => item.symbol));
          setWatchlistLoaded(true);
          return;
        }
      }

      try {
        const saved = localStorage.getItem("investiq_watchlist");
        const parsed: unknown = JSON.parse(saved ?? '["RELIANCE","TCS","INFY"]');
        if (Array.isArray(parsed)) setWatchlist(parsed.map((item) => String(item).toUpperCase()));
      } catch {
        setWatchlist(["RELIANCE", "TCS", "INFY"]);
      }
      setWatchlistLoaded(true);
    };
    void loadWatchlist();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (isSupabaseConfigured || !watchlistLoaded) return;
    localStorage.setItem(
      "investiq_watchlist",
      JSON.stringify(watchlist)
    );
  }, [watchlist, watchlistLoaded]);

  useEffect(() => {
    async function loadMarket() {
      try {
        const response = await fetch(
          `${API_URL}/market/overview`
        );

        if (!response.ok) return;

        const data = await response.json();

        if (!Array.isArray(data)) return;

        const updated = {
          ...FALLBACK,
        };

        data.forEach((item: any) => {
          if (!item?.symbol) return;

          updated[item.symbol] = {
            symbol: item.symbol,
            price: Number(item.price ?? 0),
            previous_close: Number(
              item.previous_close ??
                item.price ??
                0
            ),
            change: Number(item.change ?? 0),
            change_percent: Number(
              item.change_percent ?? 0
            ),
          };
        });

        setStocks(updated);
      } catch {
        // fallback remains active
      }
    }

    loadMarket();
  }, []);

  useEffect(() => {
    const ws = new WebSocket(
      marketWebSocketUrl()
    );

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        const updated = {
          ...stocks,
        };

        Object.entries(data ?? {}).forEach(
          ([symbol, value]: any) => {
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

        setStocks(updated);
      } catch {
        // Ignore malformed data
      }
    };

    return () => ws.close();
  }, []);

  const addStock = async (symbol: string) => {
    const cleanSymbol = symbol.toUpperCase();
    if (isSupabaseConfigured) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { error } = await supabase.from("watchlist_items").insert({ user_id: user.id, symbol: cleanSymbol });
        if (error) {
          setWatchlistError(error.message);
          return;
        }
      }
    }
    setWatchlist((current) => current.includes(cleanSymbol) ? current : [...current, cleanSymbol]);
    setWatchlistError("");

    setSearch("");
    setShowAdd(false);
  };

  const removeStock = async (symbol: string) => {
    if (isSupabaseConfigured) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { error } = await supabase.from("watchlist_items").delete().eq("user_id", user.id).eq("symbol", symbol);
        if (error) {
          setWatchlistError(error.message);
          return;
        }
      }
    }
    setWatchlist((current) => current.filter((item) => item !== symbol));
    setWatchlistError("");
  };

  const availableStocks = Object.keys(
    stocks
  ).filter(
    (symbol) =>
      !watchlist.includes(symbol) &&
      symbol
        .toLowerCase()
        .includes(search.toLowerCase())
  );

  const formatCurrency = (
    value: number | undefined | null
  ) =>
    `₹${Number(value ?? 0).toLocaleString(
      "en-IN",
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }
    )}`;

  return (
    <main className="min-h-screen bg-[#05070b] text-white">
      <header className="border-b border-white/10 bg-[#080b11]">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5">
          <div className="flex items-center gap-4">
            <button
              onClick={() =>
                router.push("/dashboard")
              }
              className="rounded-xl border border-white/10 bg-white/[0.04] p-2.5"
            >
              <ArrowLeft size={19} />
            </button>

            <div>
              <h1 className="text-xl font-semibold">
                Watchlist
              </h1>

              <p className="mt-1 text-sm text-gray-500">
                Track stocks you're interested in
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black"
          >
            <Plus size={16} />
            Add Stock
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-8">
        {watchlistError && <p role="alert" className="mb-5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">{watchlistError}</p>}
        {showAdd && (
          <div className="mb-6 rounded-2xl border border-white/10 bg-white/[0.035] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold">
                Add to Watchlist
              </h2>

              <button
                onClick={() =>
                  setShowAdd(false)
                }
                className="text-gray-500 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="relative">
              <Search
                size={17}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500"
              />

              <input
                value={search}
                onChange={(e) =>
                  setSearch(e.target.value)
                }
                placeholder="Search available stocks..."
                autoFocus
                className="w-full rounded-xl border border-white/10 bg-black/20 py-3 pl-11 pr-4 text-sm outline-none focus:border-blue-500/50"
              />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {availableStocks.map(
                (symbol) => (
                  <button
                    key={symbol}
                    onClick={() =>
                      addStock(symbol)
                    }
                    className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm transition hover:bg-white/[0.09]"
                  >
                    + {symbol}
                  </button>
                )
              )}

              {availableStocks.length ===
                0 && (
                <p className="text-sm text-gray-600">
                  No matching stocks available.
                </p>
              )}
            </div>
          </div>
        )}

        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">
              Tracking
            </p>

            <h2 className="mt-1 text-2xl font-semibold">
              {watchlist.length} Stocks
            </h2>
          </div>

          <Star
            size={22}
            className="fill-yellow-400 text-yellow-400"
          />
        </div>

        {watchlist.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.025] px-6 py-20 text-center">
            <Star
              size={30}
              className="mx-auto text-gray-600"
            />

            <h2 className="mt-5 text-lg font-semibold">
              Your watchlist is empty
            </h2>

            <p className="mt-2 text-sm text-gray-600">
              Add stocks to monitor their prices.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {watchlist.map((symbol) => {
              const stock = stocks[symbol];

              if (!stock) return null;

              const positive =
                stock.change_percent >= 0;

              return (
                <div
                  key={symbol}
                  className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 transition hover:border-white/20"
                >
                  <div className="flex items-start justify-between">
                    <button
                      onClick={() =>
                        router.push(
                          `/stock/${symbol}`
                        )
                      }
                      className="text-left"
                    >
                      <div className="flex items-center gap-2">
                        <Star
                          size={16}
                          className="fill-yellow-400 text-yellow-400"
                        />

                        <span className="font-semibold">
                          {symbol}
                        </span>
                      </div>

                      <p className="mt-1 text-xs text-gray-600">
                        NSE Equity
                      </p>
                    </button>

                    <button
                      onClick={() =>
                        removeStock(symbol)
                      }
                      className="text-gray-600 hover:text-red-400"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  <div className="mt-7 flex items-end justify-between">
                    <div>
                      <div className="text-2xl font-semibold">
                        {formatCurrency(
                          stock.price
                        )}
                      </div>

                      <div
                        className={`mt-2 flex items-center gap-1 text-sm ${
                          positive
                            ? "text-emerald-400"
                            : "text-red-400"
                        }`}
                      >
                        {positive ? (
                          <ArrowUpRight
                            size={15}
                          />
                        ) : (
                          <ArrowDownRight
                            size={15}
                          />
                        )}

                        {positive ? "+" : ""}
                        {formatCurrency(
                          stock.change
                        )}
                        <span>
                          ({positive ? "+" : ""}
                          {stock.change_percent.toFixed(
                            2
                          )}
                          %)
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() =>
                        router.push(
                          `/trade?symbol=${symbol}&side=BUY`
                        )
                      }
                      className="rounded-lg bg-white px-4 py-2 text-xs font-semibold text-black"
                    >
                      Trade
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-8 rounded-2xl border border-blue-500/10 bg-blue-500/[0.035] p-6">
          <h3 className="font-semibold text-blue-300">
            INVESTIQ Watchlist
          </h3>

          <p className="mt-2 text-sm leading-6 text-gray-500">
            Watchlist prices update from the INVESTIQ
            market feed when live market data is
            available. Your selections are saved locally
            in this demo environment.
          </p>
        </div>
      </div>
    </main>
  );
}
