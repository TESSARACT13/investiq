"use client";

import { API_URL, marketWebSocketUrl } from "@/lib/api";

import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  BrainCircuit,
  Search,
  Wifi,
  WifiOff,
} from "lucide-react";

type Stock = {
  symbol: string;
  name: string;
  price: number;
  previous_close: number;
  change: number;
  change_percent: number;
  ltq: number;
  timestamp?: string;
  source?: string;
  quote_available: boolean;
};

const SECTORS: Record<string, string> = {
  HDFCBANK: "Banking",
  ICICIBANK: "Banking",
  SBIN: "Banking",
  AXISBANK: "Banking",
  KOTAKBANK: "Banking",
  INDUSINDBK: "Banking",
  PNB: "Banking",
  BANKBARODA: "Banking",

  BAJFINANCE: "Financial Services",
  BAJAJFINSV: "Financial Services",
  SHRIRAMFIN: "Financial Services",
  JIOFIN: "Financial Services",

  HDFCLIFE: "Insurance",
  SBILIFE: "Insurance",
  ICICIPRULI: "Insurance",
  ICICIGI: "Insurance",

  TCS: "IT",
  INFY: "IT",
  HCLTECH: "IT",
  WIPRO: "IT",
  TECHM: "IT",
  LTM: "IT",
  MPHASIS: "IT",
  PERSISTENT: "IT",
  COFORGE: "IT",
  OFSS: "IT",

  RELIANCE: "Energy",
  ONGC: "Energy",
  COALINDIA: "Energy",
  BPCL: "Energy",
  IOC: "Energy",
  GAIL: "Energy",

  NTPC: "Power",
  POWERGRID: "Power",
  ADANIENSOL: "Power",
  ADANIGREEN: "Power",

  MARUTI: "Automobile",
  "M&M": "Automobile",
  TMPV: "Automobile",
  EICHERMOT: "Automobile",
  HEROMOTOCO: "Automobile",
  "BAJAJ-AUTO": "Automobile",
  TVSMOTOR: "Automobile",
  ASHOKLEY: "Automobile",

  MOTHERSON: "Auto Components",
  BOSCHLTD: "Auto Components",

  ITC: "FMCG",
  HINDUNILVR: "FMCG",
  NESTLEIND: "FMCG",
  BRITANNIA: "FMCG",
  TATACONSUM: "FMCG",
  DABUR: "FMCG",
  GODREJCP: "FMCG",
  MARICO: "FMCG",
  COLPAL: "FMCG",

  TRENT: "Retail",
  DMART: "Retail",

  SUNPHARMA: "Pharma",
  DRREDDY: "Pharma",
  CIPLA: "Pharma",
  DIVISLAB: "Pharma",
  TORNTPHARM: "Pharma",
  ZYDUSLIFE: "Pharma",
  LUPIN: "Pharma",
  AUROPHARMA: "Pharma",

  APOLLOHOSP: "Healthcare",
  MAXHEALTH: "Healthcare",

  TATASTEEL: "Metals",
  JSWSTEEL: "Metals",
  HINDALCO: "Metals",
  VEDL: "Metals",
  JINDALSTEL: "Metals",
  NMDC: "Metals",
  SAIL: "Metals",
  HINDZINC: "Metals",

  LT: "Infrastructure",
  ADANIENT: "Conglomerate",
  ADANIPORTS: "Infrastructure",
  RVNL: "Infrastructure",

  BEL: "Defence",
  HAL: "Defence",

  SIEMENS: "Industrials",
  ABB: "Industrials",
  BHEL: "Industrials",
  CUMMINSIND: "Industrials",

  BHARTIARTL: "Telecom",
  INDIGO: "Aviation",
  ETERNAL: "Technology",
  IRCTC: "Travel",
  INDHOTEL: "Hotels",

  PIDILITIND: "Chemicals",
  SRF: "Chemicals",
  UPL: "Chemicals",

  ASIANPAINT: "Consumer",
  ULTRACEMCO: "Cement",
  GRASIM: "Diversified",
  SHREECEM: "Cement",
  AMBUJACEM: "Cement",
  TITAN: "Consumer",
  HAVELLS: "Consumer",
};

const COMPANY_NAMES: Record<string, string> = {
  RELIANCE: "Reliance Industries",
  TCS: "Tata Consultancy Services",
  INFY: "Infosys",
  HDFCBANK: "HDFC Bank",
  ICICIBANK: "ICICI Bank",
  SBIN: "State Bank of India",
  AXISBANK: "Axis Bank",
  KOTAKBANK: "Kotak Mahindra Bank",
  INDUSINDBK: "IndusInd Bank",
  BAJFINANCE: "Bajaj Finance",
  BAJAJFINSV: "Bajaj Finserv",
  SHRIRAMFIN: "Shriram Finance",
  HDFCLIFE: "HDFC Life Insurance",
  SBILIFE: "SBI Life Insurance",
  ICICIPRULI: "ICICI Prudential Life Insurance",
  ICICIGI: "ICICI Lombard General Insurance",
  PNB: "Punjab National Bank",
  BANKBARODA: "Bank of Baroda",

  HCLTECH: "HCL Technologies",
  WIPRO: "Wipro",
  TECHM: "Tech Mahindra",
  LTM: "LTM",
  MPHASIS: "Mphasis",
  PERSISTENT: "Persistent Systems",
  COFORGE: "Coforge",
  OFSS: "Oracle Financial Services Software",

  ONGC: "Oil & Natural Gas Corporation",
  NTPC: "NTPC",
  POWERGRID: "Power Grid Corporation",
  COALINDIA: "Coal India",
  BPCL: "Bharat Petroleum",
  IOC: "Indian Oil Corporation",
  GAIL: "GAIL",
  ADANIENSOL: "Adani Energy Solutions",
  ADANIGREEN: "Adani Green Energy",

  MARUTI: "Maruti Suzuki",
  "M&M": "Mahindra & Mahindra",
  TMPV: "Tata Motors Passenger Vehicles",
  EICHERMOT: "Eicher Motors",
  HEROMOTOCO: "Hero MotoCorp",
  "BAJAJ-AUTO": "Bajaj Auto",
  TVSMOTOR: "TVS Motor Company",
  MOTHERSON: "Samvardhana Motherson",
  BOSCHLTD: "Bosch",
  ASHOKLEY: "Ashok Leyland",

  ITC: "ITC",
  HINDUNILVR: "Hindustan Unilever",
  NESTLEIND: "Nestle India",
  BRITANNIA: "Britannia Industries",
  TATACONSUM: "Tata Consumer Products",
  DABUR: "Dabur India",
  GODREJCP: "Godrej Consumer Products",
  MARICO: "Marico",
  COLPAL: "Colgate-Palmolive India",
  TRENT: "Trent",
  DMART: "Avenue Supermarts",

  SUNPHARMA: "Sun Pharmaceutical",
  DRREDDY: "Dr. Reddy's Laboratories",
  CIPLA: "Cipla",
  DIVISLAB: "Divi's Laboratories",
  APOLLOHOSP: "Apollo Hospitals",
  MAXHEALTH: "Max Healthcare",
  TORNTPHARM: "Torrent Pharmaceuticals",
  ZYDUSLIFE: "Zydus Lifesciences",
  LUPIN: "Lupin",
  AUROPHARMA: "Aurobindo Pharma",

  TATASTEEL: "Tata Steel",
  JSWSTEEL: "JSW Steel",
  HINDALCO: "Hindalco Industries",
  VEDL: "Vedanta",
  JINDALSTEL: "Jindal Steel & Power",
  NMDC: "NMDC",
  SAIL: "Steel Authority of India",
  HINDZINC: "Hindustan Zinc",

  LT: "Larsen & Toubro",
  ADANIENT: "Adani Enterprises",
  ADANIPORTS: "Adani Ports",
  BEL: "Bharat Electronics",
  HAL: "Hindustan Aeronautics",
  SIEMENS: "Siemens",
  ABB: "ABB India",
  BHEL: "Bharat Heavy Electricals",
  CUMMINSIND: "Cummins India",
  RVNL: "Rail Vikas Nigam",

  BHARTIARTL: "Bharti Airtel",
  INDIGO: "InterGlobe Aviation",
  ETERNAL: "Eternal",
  IRCTC: "IRCTC",
  INDHOTEL: "Indian Hotels Company",
  JIOFIN: "Jio Financial Services",

  PIDILITIND: "Pidilite Industries",
  SRF: "SRF",
  UPL: "UPL",
  ASIANPAINT: "Asian Paints",
  ULTRACEMCO: "UltraTech Cement",
  GRASIM: "Grasim Industries",
  SHREECEM: "Shree Cement",
  AMBUJACEM: "Ambuja Cements",
  TITAN: "Titan Company",
  HAVELLS: "Havells India",
};

function getSector(symbol: string): string {
  return SECTORS[symbol] || "Other";
}

function getCompanyName(symbol: string): string {
  return COMPANY_NAMES[symbol] || symbol;
}

function formatTradeTime(value?: string): string {
  if (!value) return "Time not supplied";
  const numeric = Number(value);
  const date = new Date(Number.isFinite(numeric) ? numeric < 10_000_000_000 ? numeric * 1000 : numeric : value);
  if (Number.isNaN(date.getTime())) return "Time not supplied";
  return date.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function normalizeStock(
  value: unknown,
  fallbackSymbol?: string
): Stock | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const data = value as Record<string, unknown>;

  const symbol = String(
    data.symbol || fallbackSymbol || ""
  )
    .trim()
    .toUpperCase();

  if (!symbol) {
    return null;
  }

  const price = Number(
    data.price ??
      data.last_price ??
      data.ltp ??
      0
  );

  const previousClose = Number(
    data.previous_close ??
      data.cp ??
      0
  );

  const change = Number(
    data.change ??
      price - previousClose
  );

  const changePercent = Number(
    data.change_percent ??
      (previousClose !== 0
        ? (change / previousClose) * 100
        : 0)
  );

  return {
    symbol,
    name: String(data.name || getCompanyName(symbol)),
    price,
    previous_close: previousClose,
    change,
    change_percent: changePercent,
    ltq: Number(data.ltq ?? 0),
    timestamp:
      data.timestamp !== undefined
        ? String(data.timestamp)
        : undefined,
    source: String(data.source || (price > 0 ? "last_close" : "unavailable")),
    quote_available: data.quote_available === true || price > 0,
  };
}

function normalizeMarketResponse(
  data: unknown
): Stock[] {
  if (!data || typeof data !== "object") {
    return [];
  }

  const response =
    data as Record<string, unknown>;

  const rawStocks = response.stocks;

  if (!rawStocks) {
    return [];
  }

  /*
   * INVESTIQ backend currently returns:
   *
   * stocks: {
   *   RELIANCE: {...},
   *   TCS: {...},
   *   INFY: {...}
   * }
   *
   * Convert that object into an array.
   */
  if (
    typeof rawStocks === "object" &&
    !Array.isArray(rawStocks)
  ) {
    const received = Object.entries(
      rawStocks as Record<string, unknown>
    )
      .map(([symbol, value]) =>
        normalizeStock(value, symbol)
      )
      .filter(
        (
          stock: Stock | null
        ): stock is Stock =>
          stock !== null
      );
    return received;
  }

  /*
   * Also support an array response in case
   * the backend is changed later.
   */
  if (Array.isArray(rawStocks)) {
    return rawStocks
      .map((value) =>
        normalizeStock(value)
      )
      .filter(
        (
          stock: Stock | null
        ): stock is Stock =>
          stock !== null
      );
  }

  return [];
}

export default function MarketsPage() {
  const [stocks, setStocks] =
    useState<Stock[]>([]);

  const [search, setSearch] =
    useState("");

  const [sector, setSector] =
    useState("ALL");

  const [sortBy, setSortBy] =
    useState<
      | "symbol"
      | "price"
      | "change"
      | "change_percent"
    >("symbol");

  const [sortDescending, setSortDescending] =
    useState(false);
  const [page, setPage] = useState(1);

  const [source, setSource] = useState<"live" | "last-recorded" | "unavailable">("last-recorded");
  const [marketMessage, setMarketMessage] = useState("");

  const [loading, setLoading] =
    useState(true);

  async function loadMarketOverview() {
    try {
      const response =
        await fetch(
          `${API_URL}/market/universe`,
          {
            cache: "no-store",
          }
        );

      if (!response.ok) {
        throw new Error(
          "Market overview request failed"
        );
      }

      const data =
        await response.json();

      const normalized =
        normalizeMarketResponse(
          data
        );

      console.log(
        `INVESTIQ loaded ${normalized.length} stocks`
      );

      setStocks(normalized);
      setSource(data?.source === "live" ? "live" : data?.source === "unavailable" ? "unavailable" : "last-recorded");
      setMarketMessage(String(data?.message || ""));
    } catch (error) {
      console.error(
        "Market overview error:",
        error
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMarketOverview();
  }, []);

  /*
   * LIVE UPSTOX WEBSOCKET
   */
  useEffect(() => {
    let socket: WebSocket | null =
      null;

    let reconnectTimer:
      | ReturnType<typeof setTimeout>
      | undefined;

    function connect() {
      socket =
        new WebSocket(
          marketWebSocketUrl()
        );

      socket.onopen = () => {
        console.log(
          "Connected to INVESTIQ market stream"
        );

      };

      socket.onmessage = (
        event
      ) => {
        try {
          const message =
            JSON.parse(
              event.data
            );

          const rawLiveData = message.data ?? message.stocks;
          if (message.type !== "market_update" || !rawLiveData) {
            return;
          }

          const liveData: Record<string, any> = Array.isArray(rawLiveData)
            ? Object.fromEntries(rawLiveData.map((item: any) => [String(item.symbol || "").toUpperCase(), item]))
            : rawLiveData;

          setStocks(
            (currentStocks) => {
              const updatedStocks =
                currentStocks.map(
                  (stock) => {
                    const update =
                      liveData[
                        stock.symbol
                      ];

                    if (!update) {
                      return stock;
                    }

                    const price =
                      Number(
                        update.price ??
                          update.last_price ??
                          stock.price
                      );

                    const previousClose =
                      Number(
                        update.previous_close ??
                          update.cp ??
                          stock.previous_close
                      );

                    const change =
                      Number(
                        update.change ??
                          price -
                            previousClose
                      );

                    const changePercent =
                      Number(
                        update.change_percent ??
                          (previousClose !==
                          0
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
                        update.timestamp !==
                        undefined
                          ? String(
                              update.timestamp
                            )
                          : stock.timestamp,
                      source: String(update.source || stock.source),
                      quote_available: price > 0,
                    };
                  }
                );

              return updatedStocks;
            }
          );

          if (Object.values(liveData).some((item: any) => ["upstox", "upstox_websocket"].includes(String(item?.source)))) {
            setSource("live");
          }
          setLoading(false);
        } catch (error) {
          console.error(
            "Market WebSocket parsing error:",
            error
          );
        }
      };

      socket.onclose = () => {
        console.log(
          "Market WebSocket disconnected"
        );

        reconnectTimer =
          setTimeout(
            connect,
            3000
          );
      };

      socket.onerror = () => {
      };
    }

    connect();

    return () => {
      if (reconnectTimer) {
        clearTimeout(
          reconnectTimer
        );
      }

      if (socket) {
        socket.close();
      }
    };
  }, []);

  const sectors = useMemo(
    () =>
      Array.from(
        new Set(
          stocks.map((stock) =>
            getSector(stock.symbol)
          )
        )
      ).sort(),
    [stocks]
  );

  const filteredStocks =
    useMemo(() => {
      const query =
        search
          .trim()
          .toLowerCase();

      const result =
        stocks.filter(
          (stock) => {
            const matchesSearch =
              !query ||
              stock.symbol
                .toLowerCase()
                .includes(query) ||
              stock.name
                .toLowerCase()
                .includes(query);

            const matchesSector =
              sector === "ALL" ||
              getSector(
                stock.symbol
              ) === sector;

            return (
              matchesSearch &&
              matchesSector
            );
          }
        );

      return [...result].sort(
        (a, b) => {
          let difference = 0;

          if (
            sortBy ===
            "symbol"
          ) {
            difference =
              a.symbol.localeCompare(
                b.symbol
              );
          }

          if (
            sortBy === "price"
          ) {
            difference =
              a.price - b.price;
          }

          if (
            sortBy === "change"
          ) {
            difference =
              a.change - b.change;
          }

          if (
            sortBy ===
            "change_percent"
          ) {
            difference =
              a.change_percent -
              b.change_percent;
          }

          return sortDescending
            ? -difference
            : difference;
        }
      );
    }, [
      stocks,
      search,
      sector,
      sortBy,
      sortDescending,
    ]);

  const pageSize = 24;
  const pageCount = Math.max(1, Math.ceil(filteredStocks.length / pageSize));
  const visibleStocks = filteredStocks.slice((page - 1) * pageSize, page * pageSize);

  function handleSort(
    key:
      | "symbol"
      | "price"
      | "change"
      | "change_percent"
  ) {
    if (sortBy === key) {
      setSortDescending(
        (current) => !current
      );
      return;
    }

    setSortBy(key);
    setSortDescending(
      key !== "symbol"
    );
  }

  return (
    <main className="market-explorer min-h-screen bg-[#050816] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">

        {/* HEADER */}

        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-bold">
                Markets
              </h1>

              <div
                className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${
                  source === "live"
                    ? "border-green-500/20 bg-green-500/10 text-green-400"
                    : "border-yellow-500/20 bg-yellow-500/10 text-yellow-400"
                }`}
              >
                {source === "live" ? (
                  <Wifi size={13} />
                ) : (
                  <WifiOff size={13} />
                )}

                {source === "live" ? "Live market" : source === "last-recorded" ? "Last traded prices" : "Market data reconnecting"}
              </div>
            </div>

            <p className="mt-2 text-sm text-gray-500">
              Browse the full NSE stock list. Prices use the latest Upstox trade; live updates appear during market hours.
            </p>
          </div>

          {/* SEARCH */}

          <div className="relative w-full md:w-80">
            <Search
              size={17}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500"
            />

            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search stocks..."
              className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-3 pl-11 pr-4 text-sm outline-none transition focus:border-blue-500"
            />
          </div>
        </div>

        {/* MARKET STATUS */}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Activity size={14} />

            {marketMessage || (source === "live" ? "Prices are updating from the live market feed." : source === "last-recorded" ? "After hours, prices show the latest recorded trade from Upstox." : "The full stock catalog remains available while market data reconnects.")}
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-500">
              Universe:
            </span>

            <span className="font-semibold text-white">
              {stocks.length} stocks
            </span>
          </div>
        </div>

        {/* FILTERS */}

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => { setSector("ALL"); setPage(1); }}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium transition ${
                sector === "ALL"
                  ? "bg-blue-500/15 text-blue-400"
                  : "bg-white/5 text-gray-500 hover:bg-white/10 hover:text-white"
              }`}
            >
              All sectors
            </button>

            {sectors.map(
              (item) => (
                <button
                  key={item}
                  onClick={() => { setSector(item); setPage(1); }}
                  className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium transition ${
                    sector === item
                      ? "bg-blue-500/15 text-blue-400"
                      : "bg-white/5 text-gray-500 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {item}
                </button>
              )
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() =>
                handleSort(
                  "change_percent"
                )
              }
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-400 hover:bg-white/10 hover:text-white"
            >
              Sort change
              {sortBy ===
                "change_percent" &&
                (sortDescending
                  ? " ↓"
                  : " ↑")}
            </button>

            <button
              onClick={() =>
                handleSort("price")
              }
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-400 hover:bg-white/10 hover:text-white"
            >
              Sort price
              {sortBy === "price" &&
                (sortDescending
                  ? " ↓"
                  : " ↑")}
            </button>
          </div>
        </div>

        {/* RESULT COUNT */}

        <div className="mt-5 flex items-center justify-between">
          <div className="text-sm text-gray-400">
            Showing{" "}
            <span className="font-semibold text-white">
              {
                filteredStocks.length
              }
            </span>{" "}
            of{" "}
            <span className="font-semibold text-white">
              {stocks.length}
            </span>{" "}
            stocks
          </div>

          <div className="hidden items-center gap-2 text-xs text-gray-600 sm:flex">
            <BrainCircuit size={14} />
            Quote-aware stock analysis
          </div>
        </div>

        {/* STOCK GRID */}

        {loading ? (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({
              length: 8,
            }).map(
              (_, index) => (
                <div
                  key={index}
                  className="h-64 animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]"
                />
              )
            )}
          </div>
        ) : (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visibleStocks.map(
              (stock) => {
                const positive =
                  stock.change >= 0;

                return (
                  <button
                    key={
                      stock.symbol
                    }
                    onClick={() => {
                      window.location.href =
                        `/stock/${stock.symbol}`;
                    }}
                    className="group rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-left transition hover:-translate-y-1 hover:border-blue-500/30 hover:bg-white/[0.05]"
                  >
                    {/* CARD HEADER */}

                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-lg font-bold">
                          {stock.symbol}
                        </p>

                        <p className="mt-1 line-clamp-1 text-xs text-gray-500">
                          {stock.name}
                        </p>

                        <p className="mt-1 text-[10px] uppercase tracking-wider text-gray-700">
                          {getSector(
                            stock.symbol
                          )}
                        </p>
                      </div>

                      {stock.price > 0 && <div
                        className={`rounded-lg p-2 ${
                          positive
                            ? "bg-green-500/10"
                            : "bg-red-500/10"
                        }`}
                      >
                        {positive ? (
                          <ArrowUp
                            size={15}
                            className="text-green-400"
                          />
                        ) : (
                          <ArrowDown
                            size={15}
                            className="text-red-400"
                          />
                        )}
                      </div>}
                    </div>

                    {/* PRICE */}

                    <div className="mt-7">
                      <p className="text-2xl font-bold tabular-nums">
                        {stock.price > 0 ? `₹${stock.price.toLocaleString(
                          "en-IN",
                          {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          }
                        )}` : <span className="text-sm font-medium text-gray-400">—</span>}
                      </p>

                      {stock.price <= 0 && <p className="mt-2 text-xs text-gray-500">Listed on NSE</p>}

                      {stock.price > 0 && <div className="mt-2 flex items-center gap-2 text-sm">
                        <span
                          className={
                            positive
                              ? "text-green-400"
                              : "text-red-400"
                          }
                        >
                          {positive
                            ? "+"
                            : ""}
                          {stock.change.toFixed(
                            2
                          )}
                        </span>

                        <span
                          className={
                            positive
                              ? "text-green-400"
                              : "text-red-400"
                          }
                        >
                          (
                          {positive
                            ? "+"
                            : ""}
                          {stock.change_percent.toFixed(
                            2
                          )}
                          %)
                        </span>
                      </div>}
                    </div>

                    {/* PREVIOUS CLOSE */}

                    <div className="mt-5 flex justify-between border-t border-white/10 pt-4 text-xs text-gray-600">
                      <span>{stock.price > 0 ? stock.source === "upstox_websocket" ? "Live feed" : "Last trade" : "Instrument"}</span>

                      <span>
                        {stock.price > 0 ? formatTradeTime(stock.timestamp) : "NSE listed"}
                      </span>
                    </div>

                  </button>
                );
              }
            )}
          </div>
        )}

        {!loading && pageCount > 1 && (
          <div className="mt-6 flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <p className="text-xs text-gray-500">Page {page} of {pageCount} · {filteredStocks.length} stocks</p>
            <div className="flex gap-2">
              <button onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1} className="rounded-lg border border-white/10 px-3 py-2 text-xs disabled:opacity-40">Previous</button>
              <button onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page === pageCount} className="rounded-lg border border-white/10 px-3 py-2 text-xs disabled:opacity-40">Next</button>
            </div>
          </div>
        )}

        {/* NO RESULTS */}

        {!loading &&
          filteredStocks.length ===
            0 && (
            <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-12 text-center">
              <Search
                size={28}
                className="mx-auto text-gray-600"
              />

              <p className="mt-4 text-sm text-gray-400">
                No stocks found.
              </p>

              <p className="mt-1 text-xs text-gray-600">
                Try another stock or sector.
              </p>
            </div>
          )}

        {/* FOOTER */}

        <div className="mt-12 border-t border-white/10 pt-6 text-xs text-gray-600">
          <p>
            INVESTIQ uses market data for
            simulated paper trading only.
          </p>
        </div>
      </div>
    </main>
  );
}
