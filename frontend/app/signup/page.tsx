import { AuthPanel } from "@/components/auth-panel";
import { Suspense } from "react";

export default function SignupPage() {
  return <Suspense fallback={<main className="auth-page" />}><AuthPanel initialMode="signup" /></Suspense>;
}
