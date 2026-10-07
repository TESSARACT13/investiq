"use client";

import {
  ArrowRight,
  BarChart3,
  Brain,
  ShieldCheck,
  TrendingUp,
  Zap,
} from "lucide-react";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#050816] text-white">

      {/* Navigation */}
      <nav className="border-b border-white/10 bg-[#050816]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">

          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
              <TrendingUp
                size={21}
                className="text-blue-400"
              />
            </div>

            <div>
              <h1 className="text-lg font-bold tracking-tight">
                INVESTIQ
              </h1>

              <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500">
                Intelligent Investing
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">

            <a
              href="/markets"
              className="hidden rounded-xl px-4 py-2 text-sm text-gray-400 transition hover:bg-white/5 hover:text-white sm:block"
            >
              Markets
            </a>

            <a
              href="/login"
              className="hidden rounded-xl px-4 py-2 text-sm text-gray-400 transition hover:bg-white/5 hover:text-white sm:block"
            >
              Sign in
            </a>

            <a
              href="/signup"
              className="rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-gray-200"
            >
              Create account
            </a>

          </div>

        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">

        <div className="absolute left-1/2 top-0 h-[500px] w-[700px] -translate-x-1/2 rounded-full bg-blue-500/10 blur-[120px]" />

        <div className="relative mx-auto max-w-7xl px-6 py-24 sm:py-32">

          <div className="mx-auto max-w-4xl text-center">

            <div className="mx-auto mb-6 flex w-fit items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-4 py-2 text-xs font-medium text-blue-300">
              <Zap size={14} />
                A thoughtful home for your investing life
            </div>

            <h2 className="text-5xl font-bold leading-tight tracking-tight sm:text-7xl">
              Invest with
              <span className="block bg-gradient-to-r from-blue-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent">
                intelligence.
              </span>
            </h2>

            <p className="mx-auto mt-7 max-w-2xl text-base leading-8 text-gray-400 sm:text-lg">
              Follow Indian stocks, understand your paper portfolio, and explore
              ideas with research tools that explain what they’re showing you.
            </p>

            <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">

              <a
                href="/dashboard"
                className="flex items-center justify-center gap-2 rounded-xl bg-blue-500 px-7 py-3.5 font-semibold text-white transition hover:bg-blue-400"
              >
                Open your dashboard
                <ArrowRight size={18} />
              </a>

              <a
                href="/markets"
                className="rounded-xl border border-white/10 bg-white/[0.03] px-7 py-3.5 font-semibold text-white transition hover:bg-white/[0.07]"
              >
                Explore Markets
              </a>

            </div>

          </div>

        </div>

      </section>

      {/* Core Features */}
      <section className="border-t border-white/10">

        <div className="mx-auto max-w-7xl px-6 py-20">

          <div className="mb-12">

            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-400">
              One platform
            </p>

            <h3 className="mt-3 text-3xl font-bold">
              From market data to action.
            </h3>

            <p className="mt-3 max-w-2xl text-gray-500">
              INVESTIQ connects three layers of the investing
              experience in one interface.
            </p>

          </div>

          <div className="grid gap-5 md:grid-cols-3">

            <Feature
              icon={<BarChart3 size={22} />}
              title="Market"
              description="Track real-time prices, market movements, stock details and technical information."
            />

            <Feature
              icon={<Brain size={22} />}
              title="Intelligence"
              description="Understand opportunities through AI-powered scoring, signals and personalized insights."
            />

            <Feature
              icon={<ShieldCheck size={22} />}
              title="Execution"
              description="Practice BUY and SELL strategies using a ₹1,00,000 virtual portfolio."
            />

          </div>

        </div>

      </section>

      {/* Stats */}
      <section className="border-t border-white/10">

        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-px bg-white/10 sm:grid-cols-4">

          <Stat
            value="₹1,00,000"
            label="Virtual Capital"
          />

          <Stat
            value="Real-Time"
            label="Market Data"
          />

          <Stat
            value="AI"
            label="Investment Intelligence"
          />

          <Stat
            value="100%"
            label="Paper Trading"
          />

        </div>

      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 px-6 py-8">

        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-3 text-xs text-gray-600 sm:flex-row">

          <p>
            © 2026 INVESTIQ
          </p>

          <p>
            Intelligent investing. Simulated execution.
          </p>

        </div>

      </footer>

    </main>
  );
}

function Feature({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition hover:bg-white/[0.05]">

      <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400">
        {icon}
      </div>

      <h4 className="text-lg font-semibold">
        {title}
      </h4>

      <p className="mt-3 text-sm leading-6 text-gray-500">
        {description}
      </p>

    </div>
  );
}

function Stat({
  value,
  label,
}: {
  value: string;
  label: string;
}) {
  return (
    <div className="bg-[#050816] px-5 py-8 text-center">

      <p className="text-xl font-bold sm:text-2xl">
        {value}
      </p>

      <p className="mt-2 text-xs text-gray-500">
        {label}
      </p>

    </div>
  );
}
