import { AuthPanel } from "@/components/auth-panel";
import { Suspense } from "react";

export default function LoginPage() {
  return <Suspense fallback={<main className="auth-page" />}><AuthPanel initialMode="signin" /></Suspense>;
}
