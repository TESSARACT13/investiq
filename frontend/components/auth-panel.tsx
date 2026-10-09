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
  const [otp, setOtp] = useState("");
  const [awaitingOtp, setAwaitingOtp] = useState(false);
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
            setEmail(normalizedEmail);
            setAwaitingOtp(true);
            const { error: resendError } = await supabase.auth.resend({ type: "signup", email: normalizedEmail });
            if (resendError) {
              setMessage("This email may already have an account. Try signing in or resetting its password.");
            } else {
              setMessage("If this account still needs confirmation, Supabase has been asked to send a fresh code.");
            }
            return;
          }
          throw signupError;
        }

        if (data.session) {
          router.push("/onboarding");
          return;
        }
        setEmail(normalizedEmail);
        setAwaitingOtp(true);
        setMessage("Account details saved. Enter the code from your email to finish creating your account.");
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
      if (signInError) {
        if (/email not confirmed/i.test(signInError.message)) {
          setEmail(normalizedEmail);
          setAwaitingOtp(true);
          const { error: resendError } = await supabase.auth.resend({ type: "signup", email: normalizedEmail });
          setMessage(resendError
            ? "Your email still needs confirmation. Enter the code you received, or use Resend code below."
            : "Your email still needs confirmation. Supabase has been asked to send a fresh code.");
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

  async function verifyOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearFeedback();
    if (!/^\d{6,8}$/.test(otp)) {
      setError("Enter the 6–8 digit code from your email.");
      return;
    }
    setLoading(true);
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: otp,
        type: "email",
      });
      if (verifyError) throw verifyError;
      router.push("/onboarding");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That code could not be verified. Request a new one and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function resendOtp() {
    clearFeedback();
    setLoading(true);
    try {
      const { error: resendError } = await supabase.auth.resend({ type: "signup", email: email.trim().toLowerCase() });
      if (resendError) throw resendError;
      setMessage("Code request accepted. Check your inbox and spam folder. Supabase’s built-in sender may limit delivery to project team addresses.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not request a new code. Please try again later.");
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
  const heading = awaitingOtp ? "Check your email" : isRecovery ? "Choose a new password" : mode === "signup" ? "Create your account" : "Welcome back";

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
            <p className="auth-step">{awaitingOtp ? "ONE LAST STEP" : isRecovery ? "ACCOUNT RECOVERY" : "INVESTIQ ACCOUNT"}</p>
            <h2>{heading}</h2>
            <p className="auth-subtitle">
              {awaitingOtp
                ? `Enter the 6–8 digit verification code sent to ${email}.`
                : isRecovery
                  ? "Choose a new password for your account."
                  : mode === "signup"
                    ? "Create one account for your portfolio and paper-trading workspace."
                    : "Sign in to continue to your portfolio."}
            </p>

            {awaitingOtp ? (
              <form className="auth-form" onSubmit={verifyOtp}>
                <label htmlFor="auth-otp">Email code</label>
                <div className="auth-input-wrap"><Mail size={17} /><input id="auth-otp" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,8}" maxLength={8} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="Enter your code" required /></div>
                {error && <p className="auth-error" role="alert">{error}</p>}
                {message && <p className="auth-success" role="status">{message}</p>}
                <button className="auth-submit" type="submit" disabled={loading}>{loading ? "Verifying…" : <>Verify and continue <ArrowRight size={16} /></>}</button>
                <button className="auth-reset" type="button" onClick={resendOtp} disabled={loading}>Resend code</button>
                <p className="auth-hint">If no email arrives, Supabase’s built-in sender is restricted. The project owner needs to enable custom SMTP for reliable delivery.</p>
                <button className="auth-text-button" type="button" onClick={() => { setAwaitingOtp(false); setOtp(""); clearFeedback(); }}>Back to sign in</button>
              </form>
            ) : (
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
            )}

            {!awaitingOtp && !isRecovery && mode === "signin" && <button className="auth-reset" type="button" onClick={resetPassword} disabled={loading}>Forgot password?</button>}
            {!awaitingOtp && !isRecovery && <p className="auth-switch">
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
