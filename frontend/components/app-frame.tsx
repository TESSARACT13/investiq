"use client";

import {
  Activity,
  ArrowLeftRight,
  BarChart3,
  Bot,
  BriefcaseBusiness,
  ChartNoAxesCombined,
  ChevronDown,
  CircleHelp,
  Command,
  CreditCard,
  House,
  LogIn,
  LogOut,
  ReceiptText,
  Settings2,
  Sparkles,
  Star,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { MarketTicker } from "@/components/market-ticker";

const navigation = [
  {
    title: "YOUR MONEY",
    items: [
      { label: "Overview", href: "/dashboard", icon: House },
      { label: "Portfolio", href: "/portfolio", icon: BriefcaseBusiness },
      { label: "Stocks", href: "/markets", icon: BarChart3 },
      { label: "Watchlist", href: "/watchlist", icon: Star },
      { label: "SIP plans", href: "/sips", icon: CreditCard },
      { label: "Transactions", href: "/orders", icon: ReceiptText },
    ],
  },
  {
    title: "TOOLS",
    items: [
      { label: "AI Advisor", href: "/advisor", icon: Bot },
      { label: "Quant Lab", href: "/quant", icon: ChartNoAxesCombined },
      { label: "Paper trade", href: "/trade", icon: ArrowLeftRight },
    ],
  },
];

const publicPaths = new Set(["/", "/login", "/signup", "/verify"]);

export function AppFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<{ email?: string; name?: string } | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const requiresAuth = !publicPaths.has(pathname);
  const showWorkspace = requiresAuth && pathname !== "/onboarding";

  useEffect(() => {
    let active = true;

    if (!isSupabaseConfigured) {
      setReady(true);
      return;
    }

    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      const sessionUser = error ? null : data.session?.user;
      setUser(
        sessionUser
          ? {
              email: sessionUser.email,
              name:
                sessionUser.user_metadata?.full_name ||
                sessionUser.email?.split("@")[0] ||
                "Investor",
            }
          : null,
      );
      setReady(true);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const sessionUser = session?.user;
      setUser(
        sessionUser
          ? {
              email: sessionUser.email,
              name:
                sessionUser.user_metadata?.full_name ||
                sessionUser.email?.split("@")[0] ||
                "Investor",
            }
          : null,
      );
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!ready || !requiresAuth || !isSupabaseConfigured || user) return;
    const next = encodeURIComponent(pathname || "/dashboard");
    router.replace(`/login?next=${next}`);
  }, [pathname, ready, requiresAuth, router, user]);

  async function signOut() {
    if (!isSupabaseConfigured) return;
    setSigningOut(true);
    await supabase.auth.signOut();
    setSigningOut(false);
    router.replace("/login");
  }

  if (!showWorkspace) return <>{children}</>;

  if (requiresAuth && (!ready || (isSupabaseConfigured && !user))) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f5f7f5] px-6 text-[#23332d]">
        <div className="rounded-2xl border border-[#e2e8e3] bg-white p-7 text-center shadow-sm">
          <div className="mx-auto mb-4 grid h-11 w-11 place-items-center rounded-2xl bg-[#e8f3eb] text-[#31704d]">
            <Activity size={20} />
          </div>
          <p className="font-semibold">Opening your workspace</p>
          <p className="mt-1 text-sm text-[#78857d]">Checking your account…</p>
        </div>
      </main>
    );
  }

  const initials = (user?.name || "Guest")
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <div className="app-layout">
      <aside className="app-sidebar" aria-label="Main navigation">
        <Link href="/" className="brand-lockup">
          <span className="brand-mark"><ChartNoAxesCombined size={19} /></span>
          <span>
            <span className="brand-name">investiq</span>
            <span className="brand-caption">Your money, in focus</span>
          </span>
        </Link>

        <div className="sidebar-account">
          <span className="account-avatar">{initials || "I"}</span>
          <span className="account-copy">
            <span className="account-name">{user?.name || "Guest preview"}</span>
            <span className="account-detail">{user?.email || "Paper portfolio"}</span>
          </span>
          <ChevronDown size={15} className="account-chevron" />
        </div>

        <nav className="sidebar-nav">
          {navigation.map((group) => (
            <div className="nav-group" key={group.title}>
              <p className="nav-group-title">{group.title}</p>
              {group.items.map(({ label, href, icon: Icon }) => {
                const active =
                  pathname === href ||
                  (href === "/markets" && pathname.startsWith("/stock/"));
                return (
                  <Link
                    aria-current={active ? "page" : undefined}
                    className={`sidebar-link${active ? " is-active" : ""}`}
                    href={href}
                    key={href}
                  >
                    <Icon size={17} strokeWidth={active ? 2.2 : 1.8} />
                    <span>{label}</span>
                    {href === "/advisor" && <Sparkles size={13} className="nav-sparkle" />}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-help">
            <span className="help-icon"><CircleHelp size={16} /></span>
            <span><strong>Investing, made clearer</strong><small>Explore tools at your pace.</small></span>
          </div>
          {isSupabaseConfigured ? (
            <button className="sidebar-utility" onClick={signOut} disabled={signingOut}>
              <LogOut size={16} /> {signingOut ? "Signing out…" : "Sign out"}
            </button>
          ) : (
            <Link className="sidebar-utility" href="/login">
              <LogIn size={16} /> Connect your account
            </Link>
          )}
          <span className="sidebar-footer"><Command size={13} /> INVESTIQ · PAPER MODE</span>
        </div>
      </aside>

      <div className="app-content">
        <header className="app-topbar">
          <div className="topbar-context">
            <span className="topbar-eyebrow">A little more clarity</span>
            <span className="topbar-title">Welcome{user?.name ? `, ${user.name.split(" ")[0]}` : ""}</span>
          </div>
          <div className="topbar-actions">
            <span className="market-status"><span /> Paper investing</span>
            <span className="topbar-avatar">{initials || "I"}</span>
          </div>
        </header>
        <MarketTicker />
        <div className="app-page">{children}</div>
      </div>

      <nav className="mobile-navigation" aria-label="Mobile navigation">
        {[
          { label: "Home", href: "/dashboard", icon: House },
          { label: "Stocks", href: "/markets", icon: BarChart3 },
          { label: "Portfolio", href: "/portfolio", icon: WalletCards },
          { label: "Advisor", href: "/advisor", icon: Bot },
          { label: "More", href: "/sips", icon: Settings2 },
        ].map(({ label, href, icon: Icon }) => (
          <Link className={pathname === href ? "is-active" : ""} href={href} key={href}>
            <Icon size={19} /><span>{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
