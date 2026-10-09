"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { CalendarClock, Check, CirclePause, CirclePlay, CreditCard, Plus, Sparkles, TrendingUp, X } from "lucide-react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { API_URL } from "@/lib/api";

type Frequency = "WEEKLY" | "FORTNIGHTLY" | "MONTHLY";
type SipPlan = {
  id: string;
  name: string;
  symbol: string;
  amount: number;
  frequency: Frequency;
  start_date: string;
  status: "ACTIVE" | "PAUSED";
};

const DEMO_KEY = "investiq_sip_plans";
const SIP_STOCKS = ["RELIANCE", "TCS", "INFY", "HDFCBANK", "ICICIBANK", "SBIN", "ITC", "BHARTIARTL", "TITAN", "LT"];
const currency = (amount: number) => `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const planSymbols = (value: string) => value.startsWith("BASKET|") ? value.slice(7).split(",").map((part) => part.split(":")[0]).filter(Boolean) : [value];

function estimateMonthly(amount: number, frequency: Frequency) {
  return amount * (frequency === "WEEKLY" ? 4.33 : frequency === "FORTNIGHTLY" ? 2.17 : 1);
}

function futureValue(monthly: number, months: number, annualReturn: number) {
  const rate = annualReturn / 12;
  if (!rate) return monthly * months;
  return monthly * (((1 + rate) ** months - 1) / rate) * (1 + rate);
}

export default function SipsPage() {
  const [plans, setPlans] = useState<SipPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>(["RELIANCE", "TCS"]);
  const [sipSymbols, setSipSymbols] = useState<string[]>(SIP_STOCKS);
  const [stockSearch, setStockSearch] = useState("");
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [amount, setAmount] = useState("2500");
  const [frequency, setFrequency] = useState<Frequency>("MONTHLY");
  const [expectedReturn, setExpectedReturn] = useState(12);
  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");

  async function loadPlans() {
    setLoading(true);
    setError("");
    if (isSupabaseConfigured) {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        setError("Sign in to manage your saved SIP plans.");
        setPlans([]);
      } else {
        const { data, error: planError } = await supabase.from("sip_plans").select("id,name,symbol,amount,frequency,start_date,status").eq("user_id", user.id).order("created_at", { ascending: false });
        if (planError) {
          setError(`${planError.message} Run supabase/schema.sql in the Supabase SQL Editor to create the SIP table.`);
          setPlans([]);
        } else {
          setPlans((data ?? []) as SipPlan[]);
        }
      }
    } else {
      try {
        const parsed: unknown = JSON.parse(localStorage.getItem(DEMO_KEY) ?? "[]");
        setPlans(Array.isArray(parsed) ? parsed as SipPlan[] : []);
      } catch {
        setPlans([]);
      }
    }
    setLoading(false);
  }

  useEffect(() => { void loadPlans(); }, []);
  useEffect(() => {
    fetch(`${API_URL}/market/stocks`, { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((data) => {
      if (Array.isArray(data?.stocks)) setSipSymbols(Array.from(new Set<string>(data.stocks.map((ticker: unknown) => String(ticker).toUpperCase()))));
    }).catch(() => setSipSymbols(SIP_STOCKS));
    fetch(`${API_URL}/market/overview`, { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((data) => {
      const raw = data?.stocks;
      const entries = Array.isArray(raw) ? raw.map((row: any) => [row.symbol, row.price]) : Object.entries(raw || {}).map(([key, row]: [string, any]) => [key, row?.price]);
      setPrices(Object.fromEntries(entries.map(([key, price]: any) => [String(key), Number(price || 0)])));
    }).catch(() => setPrices({}));
  }, []);

  const monthlyAmount = useMemo(
    () => plans.filter((plan) => plan.status === "ACTIVE").reduce((sum, plan) => sum + estimateMonthly(Number(plan.amount), plan.frequency), 0),
    [plans],
  );
  const activeCount = plans.filter((plan) => plan.status === "ACTIVE").length;
  const oneYearEstimate = futureValue(monthlyAmount, 12, expectedReturn / 100);

  async function savePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSavedMessage("");
    const basketSymbols = [...new Set(selectedSymbols)];
    if (basketSymbols.length === 0) {
      setError("Choose at least one stock for your basket."); setSaving(false); return;
    }
    const cleanName = name.trim() || `${basketSymbols.slice(0, 2).join(" + ")}${basketSymbols.length > 2 ? " basket" : " plan"}`;
    const planAmount = Number(amount);
    if (!Number.isFinite(planAmount) || planAmount < 500) {
      setError("Choose at least ₹500 per contribution.");
      setSaving(false);
      return;
    }

    const newPlan: SipPlan = {
      id: crypto.randomUUID(),
      name: cleanName,
      symbol: `BASKET|${basketSymbols.map((ticker) => `${ticker}:${(100 / basketSymbols.length).toFixed(2)}`).join(",")}`,
      amount: planAmount,
      frequency,
      start_date: new Date().toISOString().slice(0, 10),
      status: "ACTIVE",
    };

    if (isSupabaseConfigured) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError("Sign in before creating a SIP plan.");
        setSaving(false);
        return;
      }
      const { data, error: insertError } = await supabase.from("sip_plans").insert({
        user_id: user.id,
        name: newPlan.name,
        symbol: newPlan.symbol,
        amount: newPlan.amount,
        frequency: newPlan.frequency,
        start_date: newPlan.start_date,
      }).select("id,name,symbol,amount,frequency,start_date,status").single();
      if (insertError) {
        setError(insertError.message);
        setSaving(false);
        return;
      }
      setPlans((existing) => [data as SipPlan, ...existing]);
    } else {
      const updated = [newPlan, ...plans];
      setPlans(updated);
      localStorage.setItem(DEMO_KEY, JSON.stringify(updated));
    }

    setName("");
    setShowForm(false);
    setSavedMessage("Your plan is saved. Contributions are tracked as a plan; no money is moved automatically.");
    setSaving(false);
  }

  async function togglePlan(plan: SipPlan) {
    const status: SipPlan["status"] = plan.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    if (isSupabaseConfigured) {
      const { error: updateError } = await supabase.from("sip_plans").update({ status, updated_at: new Date().toISOString() }).eq("id", plan.id);
      if (updateError) {
        setError(updateError.message);
        return;
      }
    }
    const updated = plans.map((item) => item.id === plan.id ? { ...item, status } : item);
    setPlans(updated);
    if (!isSupabaseConfigured) localStorage.setItem(DEMO_KEY, JSON.stringify(updated));
  }

  async function deletePlan(plan: SipPlan) {
    if (isSupabaseConfigured) {
      const { error: deleteError } = await supabase.from("sip_plans").delete().eq("id", plan.id);
      if (deleteError) {
        setError(deleteError.message);
        return;
      }
    }
    const updated = plans.filter((item) => item.id !== plan.id);
    setPlans(updated);
    if (!isSupabaseConfigured) localStorage.setItem(DEMO_KEY, JSON.stringify(updated));
  }

  return (
    <main className="min-h-screen bg-[#f4f6f3] px-4 py-6 text-[#25342b] sm:px-7 sm:py-8 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#73917a]">Steady, intentional investing</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-.045em] sm:text-4xl">SIP plans</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#748178]">Build a contribution habit around the stocks you follow. Start small and adjust when life changes.</p>
          </div>
          <button onClick={() => setShowForm(!showForm)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#39734f] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#2e6544]">
            {showForm ? <X size={16} /> : <Plus size={17} />}{showForm ? "Close form" : "Create a plan"}
          </button>
        </div>

        <div className="mt-7 grid gap-3 sm:grid-cols-3">
          <Metric icon={<CreditCard size={17} />} label="Active plans" value={String(activeCount)} detail={`${plans.length} saved ${plans.length === 1 ? "plan" : "plans"}`} />
          <Metric icon={<CalendarClock size={17} />} label="Planned each month" value={currency(monthlyAmount)} detail="Based on active contribution frequency" />
          <Metric icon={<TrendingUp size={17} />} label="Illustrative 12-month value" value={currency(oneYearEstimate)} detail={`Assumes ${expectedReturn}% annual growth`} />
        </div>

        {showForm && <form onSubmit={savePlan} className="mt-5 grid gap-4 rounded-2xl border border-[#e2e9e2] bg-white p-5 shadow-sm sm:grid-cols-2 sm:p-6">
          <div className="sm:col-span-2"><p className="text-sm font-semibold">A plan that fits your rhythm</p><p className="mt-1 text-xs text-[#819087]">Add an idea to track. It won’t place or schedule a trade.</p></div>
          <label className="grid gap-2 text-xs font-semibold text-[#536259]">Plan name <input value={name} onChange={(event) => setName(event.target.value)} placeholder={`${selectedSymbols.slice(0, 2).join(" + ") || "Stock"} monthly plan`} className="rounded-xl border border-[#e1e7e1] bg-[#fbfcfa] px-3 py-3 text-sm font-normal text-[#26362d] outline-none focus:border-[#7aa486]" /></label>
          <fieldset className="grid gap-2 text-xs font-semibold text-[#536259] sm:col-span-2"><legend>Choose stocks · equal-weight basket</legend><input value={stockSearch} onChange={(event) => setStockSearch(event.target.value.toUpperCase())} placeholder="Find a stock by symbol" className="rounded-lg border border-[#e1e7e1] bg-[#fbfcfa] px-3 py-2.5 text-sm font-normal text-[#26362d] outline-none focus:border-[#7aa486]" /><p className="font-normal text-[#819087]">{selectedSymbols.length} selected from {sipSymbols.length} available · each receives an equal share of the monthly amount.</p><div className="grid max-h-56 grid-cols-2 gap-2 overflow-y-auto rounded-lg border border-[#edf0ed] bg-[#fbfcfa] p-2 sm:grid-cols-4">{sipSymbols.filter((ticker) => !stockSearch || ticker.includes(stockSearch)).map((ticker) => <label key={ticker} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 ${selectedSymbols.includes(ticker) ? "border-[#8fb198] bg-[#eff6ef] text-[#315c3c]" : "border-[#e1e7e1] bg-white text-[#66736a]"}`}><input type="checkbox" checked={selectedSymbols.includes(ticker)} onChange={(event) => setSelectedSymbols((current) => event.target.checked ? [...current, ticker] : current.filter((value) => value !== ticker))} />{ticker}</label>)}</div></fieldset>
          <label className="grid gap-2 text-xs font-semibold text-[#536259]">Contribution <span className="flex items-center rounded-xl border border-[#e1e7e1] bg-[#fbfcfa] px-3 focus-within:border-[#7aa486]"><span className="text-sm font-normal text-[#94a097]">₹</span><input type="number" min="500" step="100" required value={amount} onChange={(event) => setAmount(event.target.value)} className="w-full bg-transparent px-2 py-3 text-sm font-normal text-[#26362d] outline-none" /></span></label>
          <label className="grid gap-2 text-xs font-semibold text-[#536259]">How often <select value={frequency} onChange={(event) => setFrequency(event.target.value as Frequency)} className="rounded-xl border border-[#e1e7e1] bg-[#fbfcfa] px-3 py-3 text-sm font-normal text-[#26362d] outline-none focus:border-[#7aa486]"><option value="MONTHLY">Monthly</option><option value="FORTNIGHTLY">Every two weeks</option><option value="WEEKLY">Weekly</option></select></label>
          <div className="sm:col-span-2 rounded-xl bg-[#f5f8f4] p-4"><p className="text-xs font-semibold text-[#536259]">Monthly split preview</p><div className="mt-2 grid gap-2 sm:grid-cols-3">{selectedSymbols.map((ticker) => { const allocation = Number(amount || 0) / Math.max(1, selectedSymbols.length); const units = prices[ticker] > 0 ? Math.floor(allocation / prices[ticker]) : 0; const remainder = prices[ticker] > 0 ? allocation - units * prices[ticker] : 0; const unitEstimate = prices[ticker] > 0 ? `${units} whole shares · ${currency(remainder)} unallocated` : "Share estimate needs a live quote"; return <div key={ticker} className="rounded-lg bg-white px-3 py-2 text-xs"><strong>{ticker}</strong><span className="float-right">{currency(allocation)}</span><p className="mt-1 text-[10px] text-[#839087]">{unitEstimate}</p></div>; })}</div><p className="mt-3 text-[10px] text-[#839087]">Share counts use whole-share estimates based on the latest available quote; prices can move before an order. Any balance stays unallocated.</p></div>
          <div className="flex items-end sm:col-span-2"><button disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#39734f] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#2e6544] disabled:opacity-60">{saving ? "Saving…" : <><Check size={16} /> Save SIP plan</>}</button></div>
        </form>}

        {error && <div role="alert" className="mt-5 rounded-xl border border-[#f0d7cb] bg-[#fff7f2] px-4 py-3 text-sm text-[#95513e]">{error}</div>}
        {savedMessage && <div role="status" className="mt-5 rounded-xl border border-[#d6e8d8] bg-[#eff7ef] px-4 py-3 text-sm text-[#44704d]">{savedMessage}</div>}

        <div className="mt-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div><h2 className="text-lg font-semibold tracking-tight">Your plans</h2><p className="mt-1 text-xs text-[#839087]">A simple view of the habits you’re building.</p></div>
          <label className="flex items-center gap-3 rounded-xl border border-[#e3e9e3] bg-white px-3 py-2 text-xs text-[#78857c]">Projection assumption <select value={expectedReturn} onChange={(event) => setExpectedReturn(Number(event.target.value))} className="bg-transparent font-semibold text-[#425448] outline-none"><option value={0}>0%</option><option value={6}>6%</option><option value={12}>12%</option><option value={15}>15%</option></select></label>
        </div>

        {loading ? <div className="mt-5 rounded-2xl border border-[#e3e9e3] bg-white p-10 text-center text-sm text-[#87938b]">Loading your plans…</div> : plans.length === 0 ? <div className="mt-5 rounded-2xl border border-dashed border-[#dce5dc] bg-white/75 px-6 py-14 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#edf5ee] text-[#548260]"><Sparkles size={20} /></span><h3 className="mt-4 text-base font-semibold">Your first plan starts with a small step</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#7d8980]">Choose a stock and a contribution amount. You can pause or remove a plan whenever you need.</p><button onClick={() => setShowForm(true)} className="mt-5 rounded-xl border border-[#d6e4d7] px-4 py-2.5 text-xs font-semibold text-[#3b704c] hover:bg-[#f3f8f3]">Create your first plan</button></div> : <div className="mt-5 grid gap-3 md:grid-cols-2">{plans.map((plan) => <SipCard key={plan.id} plan={plan} onToggle={() => void togglePlan(plan)} onDelete={() => void deletePlan(plan)} />)}</div>}

        <div className="mt-6 grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-[#e1e8e1] bg-white p-5"><div className="flex items-center gap-2 text-[#55805f]"><TrendingUp size={17} /><h3 className="text-sm font-semibold text-[#34443a]">A note on projections</h3></div><p className="mt-3 text-xs leading-6 text-[#79867d]">The illustration assumes each contribution is made on time and returns compound monthly. Real market returns vary, can be negative, and are never guaranteed.</p></div>
          <div className="rounded-2xl border border-[#e1e8e1] bg-[#edf4ee] p-5"><div className="flex items-center gap-2 text-[#548260]"><CalendarClock size={17} /><h3 className="text-sm font-semibold text-[#34443a]">Paper plan, clear expectations</h3></div><p className="mt-3 text-xs leading-6 text-[#718075]">These plans help you track an intention. INVESTIQ doesn’t debit money, purchase shares on a schedule, or connect to a broker.</p></div>
        </div>
      </div>
    </main>
  );
}

function Metric({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail: string }) {
  return <div className="rounded-2xl border border-[#e3e9e3] bg-white p-4 shadow-[0_3px_14px_rgba(26,54,33,.025)] sm:p-5"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#edf5ee] text-[#548260]">{icon}</span><p className="mt-4 text-[10px] font-semibold uppercase tracking-[.11em] text-[#89958c]">{label}</p><p className="mt-1 text-2xl font-semibold tracking-[-.04em] text-[#293a30]">{value}</p><p className="mt-1 text-[10px] text-[#8b968e]">{detail}</p></div>;
}

function SipCard({ plan, onToggle, onDelete }: { plan: SipPlan; onToggle: () => void; onDelete: () => void }) {
  const monthly = estimateMonthly(Number(plan.amount), plan.frequency);
  const projection = futureValue(monthly, 12, 0.12);
  return <article className="rounded-2xl border border-[#e3e9e3] bg-white p-5 shadow-[0_3px_14px_rgba(26,54,33,.025)]">
    <div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#edf5ee] text-sm font-bold text-[#4a7857]">{planSymbols(plan.symbol).length > 1 ? `${planSymbols(plan.symbol).length}×` : plan.symbol.slice(0, 2)}</span><div><h3 className="text-sm font-semibold text-[#2d3c32]">{plan.name}</h3><p className="mt-1 text-[10px] text-[#849087]">{planSymbols(plan.symbol).join(" · ")} · {plan.frequency.toLowerCase()}</p></div></div><span className={`rounded-full px-2.5 py-1 text-[9px] font-semibold ${plan.status === "ACTIVE" ? "bg-[#edf6ed] text-[#4a7a54]" : "bg-[#f2f3f1] text-[#858e87]"}`}>{plan.status === "ACTIVE" ? "Active" : "Paused"}</span></div>
    <div className="mt-5 grid grid-cols-2 gap-3 rounded-xl bg-[#f8faf7] p-3"><div><p className="text-[9px] uppercase tracking-wider text-[#929d94]">Per contribution</p><p className="mt-1 text-base font-semibold text-[#34443a]">{currency(Number(plan.amount))}</p></div><div><p className="text-[9px] uppercase tracking-wider text-[#929d94]">Monthly pace</p><p className="mt-1 text-base font-semibold text-[#34443a]">{currency(monthly)}</p></div></div>
    <p className="mt-3 flex items-center gap-1.5 text-[10px] text-[#829087]"><TrendingUp size={13} className="text-[#5b8a64]" /> 12-month illustration: {currency(projection)} at 12% assumed growth</p>
    <div className="mt-4 flex gap-2"><button onClick={onToggle} className="inline-flex items-center gap-1.5 rounded-lg border border-[#e1e8e1] px-3 py-2 text-[10px] font-semibold text-[#57675c] hover:bg-[#f7f9f6]">{plan.status === "ACTIVE" ? <><CirclePause size={14} /> Pause</> : <><CirclePlay size={14} /> Resume</>}</button><button onClick={onDelete} className="ml-auto rounded-lg px-3 py-2 text-[10px] text-[#9a8178] hover:bg-[#fff5f1] hover:text-[#a75e46]">Remove</button></div>
  </article>;
}
