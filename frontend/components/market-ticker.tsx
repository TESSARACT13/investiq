"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { API_URL } from "@/lib/api";

type Item = { symbol: string; price: number; change_percent: number };
const featured = ["RELIANCE", "TCS", "INFY", "HDFCBANK", "ICICIBANK", "SBIN", "BHARTIARTL", "ITC", "TITAN", "LT"];

export function MarketTicker() {
  const [items, setItems] = useState<Item[]>([]);
  const [isSample, setIsSample] = useState(false);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch(`${API_URL}/market/overview`, { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json();
        if (active) setIsSample(payload?.source === "fallback");
        const rows = payload?.stocks;
        const lookup = Array.isArray(rows) ? Object.fromEntries(rows.map((row: any) => [row.symbol, row])) : rows || {};
        const next = featured
          .map((symbol) => ({ symbol, price: Number(lookup[symbol]?.price || 0), change_percent: Number(lookup[symbol]?.change_percent || 0) }))
          .filter((item) => Number.isFinite(item.price) && item.price > 0);
        if (active) setItems(next);
      } catch { /* Catalog remains useful while market data is offline. */ }
    };
    void load();
    const timer = window.setInterval(load, 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  if (items.length === 0) return null;
  const tape = [...items, ...items];
  return <div className="market-ticker" aria-label="Featured stocks">
    <div className="ticker-label">{isSample ? "SAMPLE QUOTES" : "ON THE RADAR"}</div>
    <div className="ticker-window"><div className="ticker-track">
      {tape.map((item, index) => <Link className="ticker-item" href={`/stock/${item.symbol}`} key={`${item.symbol}-${index}`}>
        <span className="ticker-monogram">{item.symbol.slice(0, 1)}</span><strong>{item.symbol}</strong>
        <span className="ticker-price">₹{item.price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
        {item.price > 0 && <span className={`ticker-change ${item.change_percent >= 0 ? "up" : "down"}`}>{item.change_percent >= 0 ? "+" : ""}{item.change_percent.toFixed(2)}%</span>}
      </Link>)}
    </div></div>
  </div>;
}
