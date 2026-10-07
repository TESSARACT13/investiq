"use client";

import { useState } from "react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function SignupPage() {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [awaitingOtp, setAwaitingOtp] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();

    setError("");
    setSuccess("");

    if (!fullName || !email || !password || !confirmPassword) {
      setError("Please fill in all fields.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (!isSupabaseConfigured) {
      setError("Connect your Supabase project first. Add its Project URL and publishable key to frontend/.env.local.");
      return;
    }

    setLoading(true);

    try {
      const normalizedEmail = email.trim().toLowerCase();
      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: {
            full_name: fullName.trim(),
          },
        },
      });

      if (error) {
        if (/already registered|already been registered|user already exists/i.test(error.message)) {
          // A previous signup may have succeeded even if its confirmation
          // email was missed. Let the user request a fresh code on this page.
          const { error: resendError } = await supabase.auth.resend({
            type: "signup",
            email: normalizedEmail,
          });
          if (!resendError) {
            setAwaitingOtp(true);
            setSuccess(`If ${normalizedEmail} is awaiting confirmation, a new code has been sent.`);
            return;
          }
        }
        setError(error.message);
        return;
      }

      if (data.user) {
        if (data.session) {
          setError("Supabase created this account without email verification, so it did not send an OTP. In Supabase, enable Authentication → Sign In / Providers → Email → Confirm email, then try again with a new email address.");
          return;
        }
        setAwaitingOtp(true);
        setSuccess(`We sent a verification code to ${normalizedEmail}.`);
      }
    } catch {
      setError("Could not reach Supabase. Check the project URL and your internet connection.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!/^\d{6}$/.test(otp)) {
      setError("Enter the verification code from your email (6–8 digits).");
      return;
    }
    setLoading(true);
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: otp,
        type: "email",
      });
      if (verifyError) {
        setError(verifyError.message);
        return;
      }
      router.push("/onboarding");
    } catch {
      setError("Could not reach Supabase. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function resendOtp() {
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email: email.trim().toLowerCase(),
      });
      if (resendError) setError(resendError.message);
      else setSuccess("A new code was requested. Check your inbox and spam folder.");
    } catch {
      setError("Could not reach Supabase. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page flex min-h-screen items-center justify-center px-6 py-10">
      <div className="w-full max-w-md">

        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold tracking-tight">
            INVESTIQ
          </h1>

          <p className="mt-2 text-gray-400">
            A calmer way to get to know your money.
          </p>
        </div>

        <div className="rounded-2xl border border-[#e5eae6] bg-white p-8 shadow-sm">

          <h2 className="text-2xl font-semibold">
            Create your account
          </h2>

          <p className="mt-2 text-sm text-gray-500">
            {awaitingOtp
              ? `Enter the verification code sent to ${email.trim()}. Verify your email to finish creating your account.`
              : "Create a secure account for your portfolio and paper-trading workspace."}
          </p>

          {!awaitingOtp ? <form onSubmit={handleSignup} className="mt-6 space-y-4">

            <input
              type="text"
              placeholder="Full name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-xl border border-[#dfe5df] bg-white px-4 py-3 text-[#26362d] outline-none focus:border-[#77a583]"
            />

            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-[#dfe5df] bg-white px-4 py-3 text-[#26362d] outline-none focus:border-[#77a583]"
            />

            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-[#dfe5df] bg-white px-4 py-3 text-[#26362d] outline-none focus:border-[#77a583]"
            />

            <input
              type="password"
              placeholder="Confirm password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-xl border border-[#dfe5df] bg-white px-4 py-3 text-[#26362d] outline-none focus:border-[#77a583]"
            />

            {error && (
              <div className="rounded-lg bg-[#fff0ec] p-3 text-sm text-[#a34b38]">
                {error}
              </div>
            )}

            {success && (
              <div className="rounded-lg bg-[#edf7ee] p-3 text-sm text-[#3c7950]">
                {success}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-[#39734f] px-4 py-3 font-semibold text-white transition hover:bg-[#2e6544] disabled:opacity-50"
            >
              {loading ? "Creating account..." : "Create account"}
            </button>

          </form> : <form onSubmit={verifyOtp} className="mt-6 space-y-4">
            <label className="block text-sm font-medium text-[#435248]" htmlFor="signup-otp">Email verification code</label>
            <input
              id="signup-otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6,8}"
              maxLength={8}
              value={otp}
              onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 8))}
              placeholder="000000"
              required
              className="w-full rounded-xl border border-[#dfe5df] bg-white px-4 py-3 text-center text-xl tracking-[0.4em] text-[#26362d] outline-none focus:border-[#77a583]"
            />
            <button type="submit" disabled={loading} className="w-full rounded-xl bg-[#39734f] px-4 py-3 font-semibold text-white transition hover:bg-[#2e6544] disabled:opacity-50">
              {loading ? "Verifying…" : "Verify email and continue"}
            </button>
            <button type="button" onClick={resendOtp} disabled={loading} className="w-full rounded-xl border border-[#dfe5df] px-4 py-3 font-semibold text-[#39734f] transition hover:bg-[#f5f8f5] disabled:opacity-50">
              {loading ? "Please wait…" : "Resend code"}
            </button>
            <p className="text-xs leading-5 text-gray-500">
              No email? Check spam. In Supabase, enable Email confirmations and set the Confirm signup template to include <code>{"{{ .Token }}"}</code>.
            </p>
            <button type="button" onClick={() => { setAwaitingOtp(false); setOtp(""); setError(""); setSuccess(""); }} className="w-full text-sm text-[#39734f] hover:underline">
              Back to account details
            </button>
          </form>}

          {!awaitingOtp && <p className="mt-6 text-center text-sm text-gray-500">
            Already have an account?{" "}
            <a
              href="/login"
              className="font-medium text-[#39734f] hover:text-[#2e6544]"
            >
              Login
            </a>
          </p>}

        </div>
      </div>
    </main>
  );
}
