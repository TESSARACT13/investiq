"use client";

import React, { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Receipt,
} from "lucide-react";
import { useRouter } from "next/navigation";

type Order = {
  id?: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  total: number;
  status?: string;
  timestamp?: string;
};

const FALLBACK_ORDERS: Order[] = [];

export default function OrdersPage() {
  const router = useRouter();

  const [orders, setOrders] = useState<Order[]>(
    FALLBACK_ORDERS
  );
  const [filter, setFilter] = useState<
    "ALL" | "BUY" | "SELL"
  >("ALL");

  const loadOrders = () => {
    if (typeof window === "undefined") return;

    try {
      const savedTrades =
        localStorage.getItem("investiq_trades");

      if (!savedTrades) {
        setOrders([]);
        return;
      }

      const parsed = JSON.parse(savedTrades);

      if (!Array.isArray(parsed)) {
        setOrders([]);
        return;
      }

      const normalized: Order[] = parsed
        .map((trade: any, index: number) => {
            const side: "BUY" | "SELL" =
            String(
              trade.side ??
                trade.type ??
                trade.action ??
                "BUY"
            ).toUpperCase() === "SELL"
              ? "SELL"
              : "BUY";

          const quantity = Number(
            trade.quantity ??
              trade.qty ??
              0
          );

          const price = Number(
            trade.price ??
              trade.executionPrice ??
              trade.avgPrice ??
              0
          );

          return {
            id: String(
              trade.id ??
                trade.orderId ??
                `order-${index}`
            ),
            symbol: String(
              trade.symbol ??
                trade.stockSymbol ??
                ""
            ).toUpperCase(),
            side,
            quantity,
            price,
            total: Number(
              trade.total ??
                trade.totalValue ??
                quantity * price
            ),
            status: trade.status ?? "EXECUTED",
            timestamp:
              trade.timestamp ??
              trade.createdAt ??
              trade.date ??
              new Date().toISOString(),
          };
        })
        .filter(
          (order) =>
            order.symbol &&
            order.quantity > 0 &&
            order.price >= 0
        )
        .reverse();

      setOrders(normalized);
    } catch {
      setOrders([]);
    }
  };

  useEffect(() => {
    loadOrders();

    const handleStorage = () => {
      loadOrders();
    };

    window.addEventListener(
      "storage",
      handleStorage
    );

    return () => {
      window.removeEventListener(
        "storage",
        handleStorage
      );
    };
  }, []);

  const filteredOrders =
    filter === "ALL"
      ? orders
      : orders.filter(
          (order) => order.side === filter
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

  const formatDate = (
    timestamp?: string
  ) => {
    if (!timestamp) return "—";

    const date = new Date(timestamp);

    if (Number.isNaN(date.getTime())) {
      return "—";
    }

    return date.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <main className="min-h-screen bg-[#05070b] text-white">
      {/* HEADER */}
      <header className="border-b border-white/10 bg-[#080b11]">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5">
          <div className="flex items-center gap-4">
            <button
              onClick={() =>
                router.push("/dashboard")
              }
              className="rounded-xl border border-white/10 bg-white/[0.04] p-2.5 transition hover:bg-white/[0.08]"
            >
              <ArrowLeft size={19} />
            </button>

            <div>
              <h1 className="text-xl font-semibold">
                Order History
              </h1>

              <p className="mt-1 text-sm text-gray-500">
                Your paper trading activity
              </p>
            </div>
          </div>

          <button
            onClick={loadOrders}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-gray-300 transition hover:bg-white/[0.08]"
          >
            <RefreshCw size={15} />
            Refresh
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-8">
        {/* SUMMARY */}
        <div className="mb-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-6">
            <p className="text-sm text-gray-500">
              Total Orders
            </p>

            <p className="mt-2 text-3xl font-semibold">
              {orders.length}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-6">
            <p className="text-sm text-gray-500">
              Buy Orders
            </p>

            <p className="mt-2 text-3xl font-semibold text-emerald-400">
              {
                orders.filter(
                  (order) =>
                    order.side === "BUY"
                ).length
              }
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-6">
            <p className="text-sm text-gray-500">
              Sell Orders
            </p>

            <p className="mt-2 text-3xl font-semibold text-red-400">
              {
                orders.filter(
                  (order) =>
                    order.side === "SELL"
                ).length
              }
            </p>
          </div>
        </div>

        {/* FILTERS */}
        <div className="mb-5 flex gap-2">
          {(
            ["ALL", "BUY", "SELL"] as const
          ).map((item) => (
            <button
              key={item}
              onClick={() =>
                setFilter(item)
              }
              className={`rounded-xl px-5 py-2.5 text-sm font-medium transition ${
                filter === item
                  ? "bg-white text-black"
                  : "border border-white/10 bg-white/[0.035] text-gray-400 hover:bg-white/[0.08]"
              }`}
            >
              {item === "ALL"
                ? "All Orders"
                : item}
            </button>
          ))}
        </div>

        {/* ORDERS */}
        {filteredOrders.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.025] px-6 py-20 text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-400">
              <Receipt size={27} />
            </div>

            <h2 className="text-lg font-semibold">
              No orders yet
            </h2>

            <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
              Your completed paper trades will
              appear here.
            </p>

            <button
              onClick={() =>
                router.push("/markets")
              }
              className="mt-6 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-gray-200"
            >
              Explore Markets
            </button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wider text-gray-500">
                    <th className="px-6 py-4">
                      Asset
                    </th>

                    <th className="px-6 py-4">
                      Type
                    </th>

                    <th className="px-6 py-4">
                      Quantity
                    </th>

                    <th className="px-6 py-4">
                      Price
                    </th>

                    <th className="px-6 py-4">
                      Total
                    </th>

                    <th className="px-6 py-4">
                      Status
                    </th>

                    <th className="px-6 py-4">
                      Date
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {filteredOrders.map(
                    (order) => (
                      <tr
                        key={order.id}
                        className="border-b border-white/[0.06] last:border-0 hover:bg-white/[0.025]"
                      >
                        {/* ASSET */}
                        <td className="px-6 py-5">
                          <div className="font-semibold">
                            {order.symbol}
                          </div>

                          <div className="mt-1 text-xs text-gray-500">
                            NSE Equity
                          </div>
                        </td>

                        {/* SIDE */}
                        <td className="px-6 py-5">
                          <div
                            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                              order.side ===
                              "BUY"
                                ? "bg-emerald-500/10 text-emerald-400"
                                : "bg-red-500/10 text-red-400"
                            }`}
                          >
                            {order.side ===
                            "BUY" ? (
                              <ArrowUpRight
                                size={14}
                              />
                            ) : (
                              <ArrowDownRight
                                size={14}
                              />
                            )}

                            {order.side}
                          </div>
                        </td>

                        {/* QUANTITY */}
                        <td className="px-6 py-5 text-sm">
                          {order.quantity}
                        </td>

                        {/* PRICE */}
                        <td className="px-6 py-5 text-sm">
                          {formatCurrency(
                            order.price
                          )}
                        </td>

                        {/* TOTAL */}
                        <td className="px-6 py-5 text-sm font-medium">
                          {formatCurrency(
                            order.total
                          )}
                        </td>

                        {/* STATUS */}
                        <td className="px-6 py-5">
                          <span className="rounded-lg bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-400">
                            {order.status ??
                              "EXECUTED"}
                          </span>
                        </td>

                        {/* DATE */}
                        <td className="px-6 py-5 text-sm text-gray-400">
                          {formatDate(
                            order.timestamp
                          )}
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* INFO */}
        <div className="mt-8 rounded-2xl border border-blue-500/10 bg-blue-500/[0.035] p-6">
          <h3 className="font-semibold text-blue-300">
            Paper Trading
          </h3>

          <p className="mt-2 text-sm leading-6 text-gray-500">
            INVESTIQ currently uses virtual funds for
            simulated trading. Orders shown here do not
            represent real-market transactions.
          </p>
        </div>
      </div>
    </main>
  );
}