"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function VerifyPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function resendEmail() {
    setError("");
    setMessage("");

    if (!email) {
      setError("Please enter your email address.");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
    });

    if (error) {
      setError(error.message);
    } else {
      setMessage("Verification email sent again. Check your inbox.");
    }

    setLoading(false);
  }

  async function checkVerification() {
    setError("");
    setMessage("");

    const { data } = await supabase.auth.getUser();

    if (data.user?.email_confirmed_at) {
      router.push("/onboarding");
    } else {
      setError(
        "Your email is not verified yet. Please verify it and try again."
      );
    }
  }

  return (
    <main className="min-h-screen bg-[#050816] text-white flex items-center justify-center px-6">
      <div className="w-full max-w-md">

        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold tracking-tight">
            INVESTIQ
          </h1>

          <p className="mt-2 text-gray-400">
            Intelligence behind your investments.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-8 shadow-2xl">

          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-500/10 text-3xl">
              ✉️
            </div>

            <h2 className="text-2xl font-semibold">
              Verify your email
            </h2>

            <p className="mt-2 text-sm leading-6 text-gray-400">
              We sent a verification link to your email address.
              Please verify your account before continuing.
            </p>
          </div>

          <div className="space-y-4">

            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-blue-500"
            />

            {error && (
              <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-400">
                {error}
              </div>
            )}

            {message && (
              <div className="rounded-lg bg-green-500/10 p-3 text-sm text-green-400">
                {message}
              </div>
            )}

            <button
              onClick={checkVerification}
              className="w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold transition hover:bg-blue-500"
            >
              I’ve verified my email
            </button>

            <button
              onClick={resendEmail}
              disabled={loading}
              className="w-full rounded-xl border border-white/10 px-4 py-3 font-semibold text-gray-300 transition hover:bg-white/5 disabled:opacity-50"
            >
              {loading ? "Sending..." : "Resend verification email"}
            </button>

          </div>

          <p className="mt-6 text-center text-xs text-gray-500">
            Check your spam or promotions folder if you don't see the email.
          </p>

        </div>
      </div>
    </main>
  );
}