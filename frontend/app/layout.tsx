import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import { AppFrame } from "@/components/app-frame";

export const metadata: Metadata = {
  title: "INVESTIQ | Market Intelligence",
  description: "Market data, investment signals, and paper trading.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        <Suspense fallback={<div className="min-h-screen bg-[#f4f6f3]" />}>
          <AppFrame>{children}</AppFrame>
        </Suspense>
      </body>
    </html>
  );
}
