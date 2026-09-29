"use client";

import { API_URL, marketWebSocketUrl } from "@/lib/api";

import React, { useEffect, useState } from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  TrendingDown,
  TrendingUp,
  Wifi,
  WifiOff,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

type Stock = {
  symbol: string;
  name: string;
  price: number;
  previous_close: number;
  change: number;
  change_percent: number;
  ltq: number;
  timestamp?: string;
};

type DemoHolding = {
  symbol: string;
  quantity: number;
  avgPrice: number;
};

type DemoTrade = {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  total: number;
  status: "EXECUTED";
  timestamp: string;
};

const FALLBACK_STOCKS: Stock[] = [
  {
    symbol: "RELIANCE",
    name: "Reliance Industries",
    price: 1226,
    previous_close: 1219.2,
    change: 6.8,
    change_percent: 0.56,
    ltq: 1,
  },
  {
    symbol: "TCS",
    name: "Tata Consultancy Services",
    price: 2082,
    previous_close: 2087,
    change: -5,
    change_percent: -0.24,
    ltq: 1,
  },
  {
    symbol: "INFY",
    name: "Infosys",
    price: 1000.2,
    previous_close: 1014.5,
    change: -14.3,
    change_percent: -1.41,
    ltq: 1,
  },
  {
    symbol: "HDFCBANK",
    name: "HDFC Bank",
    price: 735.6,
    previous_close: 728.9,
    change: 6.7,
    change_percent: 0.92,
    ltq: 200,
  },
];

const STOCK_NAMES: Record<string, string> = {
  RELIANCE: "Reliance Industries",
  TCS: "Tata Consultancy Services",
  INFY: "Infosys",
  HDFCBANK: "HDFC Bank",
};

export default function TradePage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#05070d]" />}>
      <TradePageContent />
    </Suspense>
  );
}

function TradePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [stocks, setStocks] =
    useState<Stock[]>(FALLBACK_STOCKS);

  const [selectedSymbol, setSelectedSymbol] =
    useState("RELIANCE");

  const [orderType, setOrderType] =
    useState<"BUY" | "SELL">("BUY");

  const [quantity, setQuantity] = useState(1);

  const [loading, setLoading] = useState(false);
  const [marketLoading, setMarketLoading] =
    useState(true);
  const [marketConnected, setMarketConnected] =
    useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  /* ---------------------------------------
     URL PARAMETERS
  --------------------------------------- */

  useEffect(() => {
    const symbol = searchParams.get("symbol");
    const side = searchParams.get("side");
    const urlQuantity = Number(
      searchParams.get("quantity")
    );

    if (symbol && /^[A-Z0-9.-]+$/.test(symbol)) {
      setSelectedSymbol(symbol);
    }

    if (side === "BUY" || side === "SELL") {
      setOrderType(side);
    }

    if (
      Number.isFinite(urlQuantity) &&
      urlQuantity > 0
    ) {
      setQuantity(Math.floor(urlQuantity));
    }
  }, [searchParams]);

  /* ---------------------------------------
     MARKET DATA
  --------------------------------------- */

  function normalizeStocks(data: any): Stock[] {
    if (!data || typeof data !== "object") {
      return [];
    }

    const source =
      data?.stocks &&
      typeof data.stocks === "object"
        ? data.stocks
        : data;

    const results: Stock[] = [];

    for (const [key, value] of Object.entries(
      source
    ) as [string, any][]) {
      const symbol =
        value?.symbol ??
        key.split(":").pop();

      if (!symbol || !/^[A-Z0-9.-]+$/.test(symbol)) {
        continue;
      }

      const price = Number(
        value?.price ??
          value?.last_price ??
          value?.ltp ??
          0
      );

      if (!Number.isFinite(price) || price <= 0) {
        continue;
      }

      const previousClose = Number(
        value?.previous_close ??
          value?.cp ??
          price
      );

      const change = Number.isFinite(
        Number(value?.change)
      )
        ? Number(value.change)
        : price - previousClose;

      const changePercent = Number.isFinite(
        Number(value?.change_percent)
      )
        ? Number(value.change_percent)
        : previousClose !== 0
        ? (change / previousClose) * 100
        : 0;

      results.push({
        symbol,
        name: STOCK_NAMES[symbol] ?? value?.name ?? symbol,
        price,
        previous_close: previousClose,
        change,
        change_percent: changePercent,
        ltq: Number(value?.ltq ?? 0),
        timestamp: value?.timestamp,
      });
    }

    return results;
  }

  useEffect(() => {
    async function loadMarketData() {
      try {
        const response = await fetch(
          `${API_URL}/market/overview`,
          {
            cache: "no-store",
          }
        );

        if (!response.ok) {
          throw new Error(
            "Unable to load market data"
          );
        }

        const data = await response.json();
        const normalized = normalizeStocks(data);

        if (normalized.length > 0) {
          setStocks((current) => {
            const bySymbol = new Map(
              current.map((item) => [item.symbol, item])
            );
            normalized.forEach((item) =>
              bySymbol.set(item.symbol, item)
            );
            return [...bySymbol.values()];
          });
        }
      } catch (err) {
        console.log(
          "Using fallback market prices:",
          err
        );
      } finally {
        setMarketLoading(false);
      }
    }

    loadMarketData();
  }, []);

  /* ---------------------------------------
     LIVE MARKET WEBSOCKET
  --------------------------------------- */

  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimer:
      | ReturnType<typeof setTimeout>
      | undefined;

    let stopped = false;

    function connect() {
      if (stopped) return;

      socket = new WebSocket(
        marketWebSocketUrl()
      );

      socket.onopen = () => {
        setMarketConnected(true);
      };

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(
            event.data
          );

          const liveData =
            message?.data ?? message;

          if (
            !liveData ||
            typeof liveData !== "object"
          ) {
            return;
          }

          setStocks((currentStocks) =>
            currentStocks.map((stock) => {
              const update =
                liveData[stock.symbol];

              if (!update) {
                return stock;
              }

              const price = Number(
                update.price ??
                  update.last_price ??
                  update.ltp ??
                  stock.price
              );

              const previousClose = Number(
                update.previous_close ??
                  update.cp ??
                  stock.previous_close
              );

              const change = Number(
                update.change ??
                  price - previousClose
              );

              const changePercent = Number(
                update.change_percent ??
                  (previousClose !== 0
                    ? (change /
                        previousClose) *
                      100
                    : 0)
              );

              return {
                ...stock,
                price,
                previous_close:
                  previousClose,
                change,
                change_percent:
                  changePercent,
                ltq: Number(
                  update.ltq ??
                    stock.ltq ??
                    0
                ),
                timestamp:
                  update.timestamp ??
                  stock.timestamp,
              };
            })
          );

          setMarketLoading(false);
        } catch {
          // Ignore malformed websocket data
        }
      };

      socket.onclose = () => {
        setMarketConnected(false);

        if (!stopped) {
          reconnectTimer = setTimeout(
            connect,
            3000
          );
        }
      };

      socket.onerror = () => {
        setMarketConnected(false);
      };
    }

    connect();

    return () => {
      stopped = true;

      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }

      socket?.close();
    };
  }, []);

  const stock =
    stocks.find(
      (item) =>
        item.symbol === selectedSymbol
    ) ?? stocks[0];

  const totalValue =
    stock.price * quantity;

  /* ---------------------------------------
     HELPERS
  --------------------------------------- */

  function readDemoHoldings(): DemoHolding[] {
    try {
      const raw = localStorage.getItem(
        "investiq_holdings"
      );

      if (!raw) return [];

      const parsed = JSON.parse(raw);

      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .map((item: any) => ({
          symbol: String(
            item.symbol ??
              item.stockSymbol ??
              ""
          ).toUpperCase(),

          quantity: Number(
            item.quantity ??
              item.qty ??
              0
          ),

          avgPrice: Number(
            item.avgPrice ??
              item.averagePrice ??
              item.average_price ??
              item.avg_price ??
              0
          ),
        }))
        .filter(
          (item) =>
            item.symbol &&
            item.quantity > 0
        );
    } catch {
      return [];
    }
  }

  function saveDemoHoldings(
    holdings: DemoHolding[]
  ) {
    localStorage.setItem(
      "investiq_holdings",
      JSON.stringify(holdings)
    );
  }

  function readDemoTrades(): DemoTrade[] {
    try {
      const raw = localStorage.getItem(
        "investiq_trades"
      );

      if (!raw) return [];

      const parsed = JSON.parse(raw);

      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed.map((item: any) => ({
        id: String(
          item.id ??
            Date.now()
        ),

        symbol: String(
          item.symbol ??
            item.stockSymbol ??
            ""
        ).toUpperCase(),

        side:
          String(
            item.side ??
              item.order_type ??
              item.type ??
              "BUY"
          ).toUpperCase() === "SELL"
            ? "SELL"
            : "BUY",

        quantity: Number(
          item.quantity ??
            item.qty ??
            0
        ),

        price: Number(
          item.price ??
            item.executionPrice ??
            0
        ),

        total: Number(
          item.total ??
            item.total_value ??
            item.totalValue ??
            0
        ),

        status: "EXECUTED",

        timestamp:
          item.timestamp ??
          item.created_at ??
          new Date().toISOString(),
      }));
    } catch {
      return [];
    }
  }

  /* ---------------------------------------
     EXECUTE ORDER
  --------------------------------------- */

  async function executeOrder() {
    if (
      !Number.isInteger(quantity) ||
      quantity < 1
    ) {
      setError(
        "Please enter a valid quantity of at least 1."
      );
      return;
    }

    setLoading(true);
    setMessage("");
    setError("");

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      /* -----------------------------------
         DEMO / PAPER TRADING
      ----------------------------------- */

      if (!user) {
        const currentCash = Number(
          localStorage.getItem(
            "investiq_cash"
          ) ?? "100000"
        );

        const currentHoldings =
          readDemoHoldings();

        const currentTrades =
          readDemoTrades();

        const existingHolding =
          currentHoldings.find(
            (item) =>
              item.symbol ===
              stock.symbol
          );

        /* BUY VALIDATION */

        if (
          orderType === "BUY" &&
          currentCash < totalValue
        ) {
          setError(
            `Insufficient virtual balance. Available: ₹${currentCash.toLocaleString(
              "en-IN"
            )}`
          );

          return;
        }

        /* SELL VALIDATION */

        if (
          orderType === "SELL" &&
          (!existingHolding ||
            existingHolding.quantity <
              quantity)
        ) {
          setError(
            `You don't have enough ${stock.symbol} shares to sell.`
          );

          return;
        }

        let updatedHoldings =
          [...currentHoldings];

        /* BUY */

        if (orderType === "BUY") {
          if (existingHolding) {
            const oldQuantity =
              existingHolding.quantity;

            const oldAverage =
              existingHolding.avgPrice;

            const newQuantity =
              oldQuantity + quantity;

            const newAverage =
              (oldQuantity *
                oldAverage +
                totalValue) /
              newQuantity;

            updatedHoldings =
              updatedHoldings.map(
                (item) =>
                  item.symbol ===
                  stock.symbol
                    ? {
                        ...item,
                        quantity:
                          newQuantity,
                        avgPrice:
                          newAverage,
                      }
                    : item
              );
          } else {
            updatedHoldings.push({
              symbol:
                stock.symbol,
              quantity,
              avgPrice:
                stock.price,
            });
          }
        }

        /* SELL */

        if (orderType === "SELL") {
          if (
            existingHolding &&
            existingHolding.quantity ===
              quantity
          ) {
            updatedHoldings =
              updatedHoldings.filter(
                (item) =>
                  item.symbol !==
                  stock.symbol
              );
          } else {
            updatedHoldings =
              updatedHoldings.map(
                (item) =>
                  item.symbol ===
                  stock.symbol
                    ? {
                        ...item,
                        quantity:
                          item.quantity -
                          quantity,
                      }
                    : item
              );
          }
        }

        /* SAVE HOLDINGS */

        saveDemoHoldings(
          updatedHoldings
        );

        /* UPDATE CASH */

        const newCash =
          orderType === "BUY"
            ? currentCash -
              totalValue
            : currentCash +
              totalValue;

        localStorage.setItem(
          "investiq_cash",
          String(newCash)
        );

        /* SAVE TRADE */

        const newTrade: DemoTrade = {
          id: `${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 8)}`,

          symbol:
            stock.symbol,

          side: orderType,

          quantity,

          price: stock.price,

          total: totalValue,

          status: "EXECUTED",

          timestamp:
            new Date().toISOString(),
        };

        localStorage.setItem(
          "investiq_trades",
          JSON.stringify([
            ...currentTrades,
            newTrade,
          ])
        );

        /* CROSS-TAB / SAME-APP EVENT */

        window.dispatchEvent(
          new Event(
            "investiq-data-updated"
          )
        );

        setMessage(
          `${orderType} executed: ${quantity} ${stock.symbol} for ₹${totalValue.toLocaleString(
            "en-IN",
            {
              minimumFractionDigits: 2,
            }
          )}`
        );

        return;
      }

      /* -----------------------------------
         SUPABASE TRADING
      ----------------------------------- */

      const {
        data: wallet,
        error: walletError,
      } = await supabase
        .from("wallets")
        .select("id, balance")
        .eq("user_id", user.id)
        .single();

      if (walletError || !wallet) {
        throw new Error(
          "Wallet not found."
        );
      }

      /* BUY */

      if (orderType === "BUY") {
        if (
          Number(wallet.balance) <
          totalValue
        ) {
          throw new Error(
            "Insufficient virtual balance."
          );
        }

        const newBalance =
          Number(wallet.balance) -
          totalValue;

        const {
          error: balanceError,
        } = await supabase
          .from("wallets")
          .update({
            balance: newBalance,
          })
          .eq("id", wallet.id);

        if (balanceError) {
          throw balanceError;
        }

        const {
          data: existingHolding,
        } = await supabase
          .from("holdings")
          .select("*")
          .eq(
            "user_id",
            user.id
          )
          .eq(
            "symbol",
            stock.symbol
          )
          .maybeSingle();

        if (existingHolding) {
          const oldQuantity =
            Number(
              existingHolding.quantity
            );

          const oldAverage =
            Number(
              existingHolding.average_price
            );

          const newQuantity =
            oldQuantity + quantity;

          const newAverage =
            (oldQuantity *
              oldAverage +
              totalValue) /
            newQuantity;

          const {
            error,
          } = await supabase
            .from("holdings")
            .update({
              quantity:
                newQuantity,
              average_price:
                newAverage,
            })
            .eq(
              "id",
              existingHolding.id
            );

          if (error) throw error;
        } else {
          const { error } =
            await supabase
              .from("holdings")
              .insert({
                user_id:
                  user.id,
                symbol:
                  stock.symbol,
                quantity,
                average_price:
                  stock.price,
              });

          if (error) throw error;
        }

        const { error } =
          await supabase
            .from("orders")
            .insert({
              user_id:
                user.id,
              symbol:
                stock.symbol,
              order_type:
                "BUY",
              quantity,
              price:
                stock.price,
              total_value:
                totalValue,
              status:
                "EXECUTED",
            });

        if (error) throw error;
      }

      /* SELL */

      if (orderType === "SELL") {
        const {
          data: holding,
          error: holdingError,
        } = await supabase
          .from("holdings")
          .select("*")
          .eq(
            "user_id",
            user.id
          )
          .eq(
            "symbol",
            stock.symbol
          )
          .maybeSingle();

        if (holdingError) {
          throw holdingError;
        }

        if (
          !holding ||
          Number(
            holding.quantity
          ) < quantity
        ) {
          throw new Error(
            "You don't have enough shares to sell."
          );
        }

        const newQuantity =
          Number(
            holding.quantity
          ) - quantity;

        if (newQuantity === 0) {
          const { error } =
            await supabase
              .from("holdings")
              .delete()
              .eq(
                "id",
                holding.id
              );

          if (error) throw error;
        } else {
          const { error } =
            await supabase
              .from("holdings")
              .update({
                quantity:
                  newQuantity,
              })
              .eq(
                "id",
                holding.id
              );

          if (error) throw error;
        }

        const newBalance =
          Number(wallet.balance) +
          totalValue;

        const {
          error: balanceError,
        } = await supabase
          .from("wallets")
          .update({
            balance: newBalance,
          })
          .eq("id", wallet.id);

        if (balanceError) {
          throw balanceError;
        }

        const { error } =
          await supabase
            .from("orders")
            .insert({
              user_id:
                user.id,
              symbol:
                stock.symbol,
              order_type:
                "SELL",
              quantity,
              price:
                stock.price,
              total_value:
                totalValue,
              status:
                "EXECUTED",
            });

        if (error) throw error;
      }

      setMessage(
        `${orderType} executed: ${quantity} ${stock.symbol} for ₹${totalValue.toLocaleString(
          "en-IN",
          {
            minimumFractionDigits: 2,
          }
        )}`
      );
    } catch (err: any) {
      setError(
        err?.message ??
          "Something went wrong while placing the order."
      );
    } finally {
      setLoading(false);
    }
  }

  /* ---------------------------------------
     UI
  --------------------------------------- */

  return (
    <main className="min-h-screen bg-[#050816] px-5 py-8 text-white">
      <div className="mx-auto max-w-5xl">
        {/* HEADER */}

        <div className="mb-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() =>
                router.push("/dashboard")
              }
              className="rounded-xl border border-white/10 p-3 transition hover:bg-white/5"
            >
              <ArrowLeft size={18} />
            </button>

            <div>
              <h1 className="text-2xl font-bold">
                Paper Trading
              </h1>

              <p className="mt-1 text-sm text-gray-500">
                Practice trading with virtual capital
              </p>
            </div>
          </div>

          <div
            className={`flex items-center gap-2 rounded-full border px-3 py-2 text-xs ${
              marketConnected
                ? "border-green-500/20 bg-green-500/10 text-green-400"
                : "border-yellow-500/20 bg-yellow-500/10 text-yellow-400"
            }`}
          >
            {marketConnected ? (
              <Wifi size={13} />
            ) : (
              <WifiOff size={13} />
            )}

            {marketConnected
              ? "Live"
              : "Last recorded"}
          </div>
        </div>

        {marketLoading && (
          <div className="mb-6 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-gray-500">
            Loading latest market prices...
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          {/* STOCKS */}

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <div className="mb-6">
              <p className="text-xs uppercase tracking-wider text-gray-500">
                Select Stock
              </p>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {stocks.map((item) => (
                  <button
                    key={item.symbol}
                    onClick={() =>
                      setSelectedSymbol(
                        item.symbol
                      )
                    }
                    className={`rounded-xl border p-4 text-left transition ${
                      selectedSymbol ===
                      item.symbol
                        ? "border-blue-500 bg-blue-500/10"
                        : "border-white/10 bg-white/[0.02] hover:bg-white/5"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold">
                          {item.symbol}
                        </p>

                        <p className="mt-1 text-xs text-gray-500">
                          {item.name}
                        </p>
                      </div>

                      {item.change >= 0 ? (
                        <TrendingUp
                          size={18}
                          className="text-green-400"
                        />
                      ) : (
                        <TrendingDown
                          size={18}
                          className="text-red-400"
                        />
                      )}
                    </div>

                    <p className="mt-4 text-lg font-semibold tabular-nums">
                      ₹
                      {item.price.toLocaleString(
                        "en-IN",
                        {
                          minimumFractionDigits: 2,
                        }
                      )}
                    </p>

                    <p
                      className={`mt-1 text-xs ${
                        item.change >= 0
                          ? "text-green-400"
                          : "text-red-400"
                      }`}
                    >
                      {item.change >= 0
                        ? "+"
                        : ""}
                      {item.change_percent.toFixed(
                        2
                      )}
                      %
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* SELECTED STOCK */}

            <div className="rounded-xl border border-white/10 bg-black/20 p-5">
              <p className="text-sm text-gray-500">
                Selected Instrument
              </p>

              <div className="mt-2 flex items-end justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold">
                    {stock.symbol}
                  </h2>

                  <p className="text-sm text-gray-500">
                    {stock.name}
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-2xl font-bold tabular-nums">
                    ₹
                    {stock.price.toLocaleString(
                      "en-IN",
                      {
                        minimumFractionDigits: 2,
                      }
                    )}
                  </p>

                  <p
                    className={`text-xs ${
                      stock.change >= 0
                        ? "text-green-400"
                        : "text-red-400"
                    }`}
                  >
                    {stock.change >= 0
                      ? "+"
                      : ""}
                    {stock.change.toFixed(2)}{" "}
                    (
                    {stock.change >= 0
                      ? "+"
                      : ""}
                    {stock.change_percent.toFixed(
                      2
                    )}
                    %)
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ORDER PANEL */}

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <h2 className="text-lg font-semibold">
              Place Order
            </h2>

            <p className="mt-1 text-xs text-gray-500">
              Virtual paper trade
            </p>

            <div className="mt-6 grid grid-cols-2 gap-2 rounded-xl bg-black/30 p-1">
              <button
                onClick={() =>
                  setOrderType("BUY")
                }
                className={`rounded-lg py-3 text-sm font-semibold transition ${
                  orderType === "BUY"
                    ? "bg-green-500 text-black"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                BUY
              </button>

              <button
                onClick={() =>
                  setOrderType("SELL")
                }
                className={`rounded-lg py-3 text-sm font-semibold transition ${
                  orderType === "SELL"
                    ? "bg-red-500 text-white"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                SELL
              </button>
            </div>

            <div className="mt-6">
              <label className="text-sm text-gray-400">
                Quantity
              </label>

              <input
                type="number"
                min="1"
                value={
                  quantity === 0
                    ? ""
                    : quantity
                }
                onChange={(e) => {
                  const value =
                    e.target.value.replace(
                      /\D/g,
                      ""
                    );

                  setQuantity(
                    value === ""
                      ? 0
                      : Number(value)
                  );
                }}
                onBlur={() => {
                  if (quantity < 1) {
                    setQuantity(1);
                  }
                }}
                className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-blue-500"
              />
            </div>

            <div className="mt-6 rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">
                  Price
                </span>

                <span>
                  ₹
                  {stock.price.toLocaleString(
                    "en-IN",
                    {
                      minimumFractionDigits: 2,
                    }
                  )}
                </span>
              </div>

              <div className="mt-3 flex justify-between text-sm">
                <span className="text-gray-500">
                  Quantity
                </span>

                <span>{quantity}</span>
              </div>

              <div className="my-4 border-t border-white/10" />

              <div className="flex justify-between">
                <span className="font-medium">
                  Total
                </span>

                <span className="text-xl font-bold">
                  ₹
                  {totalValue.toLocaleString(
                    "en-IN",
                    {
                      minimumFractionDigits: 2,
                    }
                  )}
                </span>
              </div>
            </div>

            {message && (
              <div className="mt-4 rounded-xl border border-green-500/20 bg-green-500/10 p-3 text-sm text-green-400">
                {message}
              </div>
            )}

            {error && (
              <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <button
              onClick={executeOrder}
              disabled={loading}
              className={`mt-5 w-full rounded-xl py-3 font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                orderType === "BUY"
                  ? "bg-green-500 text-black hover:bg-green-400"
                  : "bg-red-500 text-white hover:bg-red-400"
              }`}
            >
              {loading
                ? "Processing..."
                : `${orderType} ${stock.symbol}`}
            </button>

            <p className="mt-4 text-center text-xs text-gray-600">
              Simulated paper trading. No real
              money is involved.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
