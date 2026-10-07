"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function OnboardingPage() {
  const router = useRouter();

  const [age, setAge] = useState("");
  const [riskLevel, setRiskLevel] = useState("Moderate");
  const [goal, setGoal] = useState("Wealth Creation");
  const [horizon, setHorizon] = useState("3-5 Years");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!age) {
      setError("Please enter your age.");
      return;
    }

    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/login");
      return;
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .upsert({
        id: user.id,
        full_name: user.user_metadata?.full_name || "INVESTIQ User",
        email: user.email || "",
        age: Number(age),
        risk_level: riskLevel,
        investment_goal: goal,
        investment_horizon: horizon,
      });

    if (profileError) {
      setError(profileError.message);
      setLoading(false);
      return;
    }

    // The RPC can safely create a missing wallet for an existing account. The
    // database function derives the user ID from the signed-in session.
    const { data: wallet, error: walletError } = await supabase.rpc("ensure_paper_wallet");

    if (walletError || !wallet?.length) {
      setError(walletError
        ? `We couldn't set up your paper wallet: ${walletError.message}. In Supabase, run the latest supabase/schema.sql, then try again.`
        : "We couldn't confirm your paper wallet. In Supabase, run the latest supabase/schema.sql, then try again.");
      setLoading(false);
      return;
    }

    router.push("/dashboard");
  }

  return (
    <main className="min-h-screen bg-[#050816] text-white flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-xl">

        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold">INVESTIQ</h1>

          <p className="mt-2 text-gray-400">
            Let's personalize your investment intelligence.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-8 shadow-2xl">

          <h2 className="text-2xl font-semibold">
            Investment Profile
          </h2>

          <p className="mt-2 text-sm text-gray-400">
            These details help our AI understand your investment profile.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-5">

            {/* Age */}
            <div>
              <label className="mb-2 block text-sm text-gray-300">
                Age
              </label>

              <input
                type="number"
                min="13"
                max="100"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="Enter your age"
                className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-blue-500"
              />
            </div>

            {/* Risk */}
            <div>
              <label className="mb-2 block text-sm text-gray-300">
                Risk Profile
              </label>

              <select
                value={riskLevel}
                onChange={(e) => setRiskLevel(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#0b1020] px-4 py-3 outline-none focus:border-blue-500"
              >
                <option>Conservative</option>
                <option>Moderate</option>
                <option>Aggressive</option>
              </select>
            </div>

            {/* Goal */}
            <div>
              <label className="mb-2 block text-sm text-gray-300">
                Investment Goal
              </label>

              <select
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#0b1020] px-4 py-3 outline-none focus:border-blue-500"
              >
                <option>Wealth Creation</option>
                <option>Retirement</option>
                <option>Short-Term Growth</option>
                <option>Capital Preservation</option>
              </select>
            </div>

            {/* Horizon */}
            <div>
              <label className="mb-2 block text-sm text-gray-300">
                Investment Horizon
              </label>

              <select
                value={horizon}
                onChange={(e) => setHorizon(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#0b1020] px-4 py-3 outline-none focus:border-blue-500"
              >
                <option>Less than 1 Year</option>
                <option>1-3 Years</option>
                <option>3-5 Years</option>
                <option>5+ Years</option>
              </select>
            </div>

            {error && (
              <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold transition hover:bg-blue-500 disabled:opacity-50"
            >
              {loading
                ? "Setting up your account..."
                : "Continue to INVESTIQ"}
            </button>

          </form>

          <div className="mt-6 rounded-xl border border-green-500/20 bg-green-500/5 p-4">
            <p className="text-sm text-green-400">
              💰 Your account will receive
            </p>

            <p className="mt-1 text-xl font-bold">
              ₹1,00,000
            </p>

            <p className="text-xs text-gray-500">
              Virtual trading capital
            </p>
          </div>

        </div>
      </div>
    </main>
  );
}
