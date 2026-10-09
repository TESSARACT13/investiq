"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { ArrowRight, ChartNoAxesCombined, Eye, EyeOff, LockKeyhole, Mail, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

type AuthMode = "signin" | "signup";

export function AuthPanel({ initialMode }: { initialMode: AuthMode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode: AuthMode = searchParams.get("mode") === "signup" ? "signup" : initialMode;
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const resetMode = searchParams.get("mode") === "recovery";

  function clearFeedback() {
    setError("");
    setMessage("");
  }

  function destination() {
    const next = new URLSearchParams(window.location.search).get("next");
    return next?.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearFeedback();
    if (!isSupabaseConfigured) {
      setError("INVESTIQ is not connected to Supabase yet. Please try again later.");
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    setLoading(true);
    try {
      if (resetMode) {
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) throw updateError;
        router.replace("/dashboard");
        return;
      }

      if (mode === "signup") {
        const { data, error: signupError } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: { data: { full_name: fullName.trim() } },
        });

        if (signupError) {
          if (/already registered|already been registered|user already exists/i.test(signupError.message)) {
            setMessage("This email already has an account. Sign in instead, or reset its password.");
            return;
          }
          throw signupError;
        }

        if (data.session) {
          router.push("/onboarding");
          return;
        }
        setError("Supabase is still requiring email confirmation for this project. Finish disabling email confirmation in Supabase, then try again.");
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
      if (signInError) {
        if (/email not confirmed/i.test(signInError.message)) {
          setError("This account was created before email confirmation was turned off. The project owner needs to confirm this existing account once in Supabase.");
          return;
        }
        throw signInError;
      }
      router.replace(destination());
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : "Something went wrong. Please try again.";
      if (/fetch|network|load failed/i.test(text)) {
        setError("Could not reach Supabase. Check your internet connection and try again.");
      } else {
        setError(text);
      }
    } finally {
      setLoading(false);
    }
  }

  async function resetPassword() {
    clearFeedback();
    if (!email.trim()) {
      setError("Enter your email address first.");
      return;
    }
    if (!isSupabaseConfigured) {
      setError("INVESTIQ is not connected to Supabase yet. Please try again later.");
      return;
    }
    setLoading(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: `${window.location.origin}/login?mode=recovery`,
      });
      if (resetError) throw resetError;
      setMessage("If an account exists for this email, a password reset email has been requested.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not request a password reset. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const isRecovery = resetMode;
  const heading = isRecovery ? "Choose a new password" : mode === "signup" ? "Create your account" : "Welcome back";

  return (
    <main className="auth-page">
      <div className="auth-layout">
        <section className="auth-welcome">
          <Link href="/" className="auth-brand"><span><ChartNoAxesCombined size={20} /></span> investiq</Link>
          <div className="auth-story">
            <p className="auth-kicker">A calmer way to invest</p>
            <h1>Your financial life,<br /><em>all in one place.</em></h1>
            <p>Follow the market, understand your portfolio, and make a plan that feels like yours.</p>
          </div>
          <div className="auth-note"><span>✳</span> Thoughtful tools. Your decisions.</div>
        </section>

        <section className="auth-card-wrap">
          <div className="auth-card">
            <p className="auth-step">{isRecovery ? "ACCOUNT RECOVERY" : "INVESTIQ ACCOUNT"}</p>
            <h2>{heading}</h2>
            <p className="auth-subtitle">
              {isRecovery
                ? "Choose a new password for your account."
                : mode === "signup"
                  ? "Create one account for your portfolio and paper-trading workspace."
                  : "Sign in to continue to your portfolio."}
            </p>

            <form className="auth-form" onSubmit={handleSubmit}>
                {mode === "signup" && !isRecovery && <>
                  <label htmlFor="full-name">Your name</label>
                  <div className="auth-input-wrap"><UserRound size={17} /><input id="full-name" type="text" autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="How should we address you?" required /></div>
                </>}
                {isRecovery && <>
                  <label htmlFor="email">Email address</label>
                  <div className="auth-input-wrap"><Mail size={17} /><input id="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required /></div>
                </>}
                {!isRecovery && <>
                  <label htmlFor="email">Email address</label>
                  <div className="auth-input-wrap"><Mail size={17} /><input id="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required /></div>
                </>}
                <label htmlFor="password">{isRecovery ? "New password" : "Password"}</label>
                <div className="auth-input-wrap"><LockKeyhole size={17} /><input id="password" type={showPassword ? "text" : "password"} autoComplete={isRecovery || mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={isRecovery ? "Choose a new password" : mode === "signup" ? "At least 6 characters" : "Your password"} required minLength={6} /><button className="password-toggle" type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>
                {error && <p className="auth-error" role="alert">{error}</p>}
                {message && <p className="auth-success" role="status">{message}</p>}
                <button className="auth-submit" type="submit" disabled={loading}>{loading ? "Please wait…" : <>{isRecovery ? "Update password" : mode === "signup" ? "Create account" : "Sign in"} <ArrowRight size={16} /></>}</button>
            </form>

            {!isRecovery && mode === "signin" && <button className="auth-reset" type="button" onClick={resetPassword} disabled={loading}>Forgot password?</button>}
            {!isRecovery && <p className="auth-switch">
              {mode === "signup" ? "Already have an account? " : "New to INVESTIQ? "}
              <Link href={mode === "signup" ? "/login" : "/signup"}>
                {mode === "signup" ? "Sign in" : "Create an account"}
              </Link>
            </p>}
            <p className="auth-footnote">Paper investing only · No real orders are placed</p>
          </div>
        </section>
      </div>
    </main>
  );
}
