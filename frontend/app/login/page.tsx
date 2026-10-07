"use client";

import { useEffect, useState } from "react";
import { ArrowRight, ChartNoAxesCombined, Eye, EyeOff, Mail, LockKeyhole } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetMode, setResetMode] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setResetMode(new URLSearchParams(window.location.search).get("mode") === "recovery");
  }, []);

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!isSupabaseConfigured) {
      setError("Connect your Supabase project first. Add its Project URL and publishable key to frontend/.env.local.");
      return;
    }
    setLoading(true);
    if (resetMode) {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      setLoading(false);
      if (updateError) {
        setError(updateError.message);
        return;
      }
      setResetMode(false);
      router.replace("/dashboard");
      return;
    }
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    const destination = new URLSearchParams(window.location.search).get("next");
    router.replace(destination?.startsWith("/") && !destination.startsWith("//") ? destination : "/dashboard");
  }

  async function resetPassword() {
    setError("");
    setResetSent(false);
    if (!isSupabaseConfigured) {
      setError("Connect your Supabase project before requesting a password reset.");
      return;
    }
    if (!email.trim()) {
      setError("Enter your email first, then choose reset password.");
      return;
    }
    setLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/login?mode=recovery`,
    });
    setLoading(false);
    if (resetError) setError(resetError.message);
    else setResetSent(true);
  }

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
            <p className="auth-step">WELCOME BACK</p>
            <h2>{resetMode ? "Choose a new password" : "Sign in to your account"}</h2>
            <p className="auth-subtitle">{resetMode ? "Use at least 6 characters for your new password." : "Pick up where you left off."}</p>
            <form className="auth-form" onSubmit={signIn}>
              <label htmlFor="email">Email address</label>
              <div className="auth-input-wrap"><Mail size={17} /><input id="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required /></div>
              <label htmlFor="password">{resetMode ? "New password" : "Password"}</label>
              <div className="auth-input-wrap"><LockKeyhole size={17} /><input id="password" type={showPassword ? "text" : "password"} autoComplete={resetMode ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={resetMode ? "Choose a new password" : "Your password"} required minLength={6} /><button className="password-toggle" type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>
              {error && <p className="auth-error" role="alert">{error}</p>}
              {resetSent && <p className="auth-success" role="status">Password reset link sent. Check your inbox.</p>}
              <button className="auth-submit" type="submit" disabled={loading}>{loading ? resetMode ? "Updating…" : "Signing in…" : <>{resetMode ? "Update password" : "Sign in"} <ArrowRight size={16} /></>}</button>
            </form>
            {!resetMode && <button className="auth-reset" type="button" onClick={resetPassword} disabled={loading}>Forgot password?</button>}
            {!resetMode && <p className="auth-switch">New to INVESTIQ? <Link href="/signup">Create an account</Link></p>}
            <p className="auth-footnote">Paper investing only · No real orders are placed</p>
          </div>
        </section>
      </div>
    </main>
  );
}
