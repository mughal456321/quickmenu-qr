"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "../../lib/auth";
import {
  ChevronRightIcon,
  GlobeIcon,
  LogOutIcon,
  QrIcon,
  ReceiptIcon,
  SettingsIcon,
  UtensilsIcon,
  UsersIcon,
} from "../../components/icons";

const NAV_ITEMS = [
  { href: "/dashboard/menu", label: "Menu Builder", hint: "Categories and items", icon: UtensilsIcon },
  { href: "/dashboard/tables", label: "Tables & QR", hint: "Print table codes", icon: QrIcon },
  { href: "/dashboard/orders", label: "Orders", hint: "Staff order board", icon: ReceiptIcon },
  { href: "/dashboard/staff", label: "Staff", hint: "Kitchen accounts", icon: UsersIcon },
  { href: "/dashboard/settings", label: "Settings", hint: "Restaurant profile", icon: SettingsIcon },
] as const;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { status, user, restaurant, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const isLegacyOrders = pathname === "/dashboard/orders";

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (isLegacyOrders) return;
    if (status === "anonymous") {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (status === "authenticated" && user?.role === "kitchen") {
      router.replace("/kitchen");
    }
  }, [status, user, router, pathname, isLegacyOrders]);

  // `/dashboard/orders` keeps its self-contained staff login (the Week 6 E2E
  // flow depends on it). Every other dashboard screen uses the cookie session.
  if (isLegacyOrders) return <>{children}</>;

  if (status !== "authenticated" || !user || user.role !== "owner") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas">
        <p className="flex items-center gap-3 text-sm text-muted" role="status">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-ink" />
          Loading your dashboard…
        </p>
      </main>
    );
  }

  async function signOut() {
    await logout();
    router.replace("/login");
  }

  const sidebar = (
    <div className="flex h-full flex-col bg-surface">
      <div className="border-b border-line px-5 py-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
          QuickMenu QR
        </p>
        <p className="display mt-1.5 truncate text-[21px] leading-tight text-ink">
          {restaurant?.name ?? "Owner dashboard"}
        </p>
        <p className="mt-0.5 truncate text-[11.5px] text-muted">{user.email}</p>
      </div>

      <nav aria-label="Dashboard" className="flex-1 space-y-0.5 px-3 py-4">
        {NAV_ITEMS.map((item) => {
          const active =
            pathname === item.href ||
            (item.href === "/dashboard/menu" && pathname === "/dashboard");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`group flex items-start gap-3 rounded-xl px-3 py-2.5 transition ${
                active ? "bg-ink text-canvas" : "text-ink2 hover:bg-ink/[0.04]"
              }`}
            >
              <Icon size={17} className={`mt-0.5 ${active ? "opacity-90" : "text-muted"}`} />
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-medium leading-tight">
                  {item.label}
                </span>
                <span
                  className={`mt-0.5 block text-[11px] leading-tight ${
                    active ? "text-canvas/60" : "text-muted"
                  }`}
                >
                  {item.hint}
                </span>
              </span>
              <ChevronRightIcon
                size={14}
                className={`mt-1 ${active ? "opacity-50" : "text-line-strong"}`}
              />
            </Link>
          );
        })}
      </nav>

      <div className="space-y-2 border-t border-line p-4">
        <Link
          href="/kitchen"
          className="flex items-center justify-center gap-2 rounded-xl border border-line px-3 py-2.5 text-[12.5px] font-medium text-ink2 transition hover:border-line-strong"
        >
          <GlobeIcon size={15} className="text-muted" />
          Open kitchen board
        </Link>
        <button
          type="button"
          onClick={() => void signOut()}
          className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-[12.5px] font-medium text-muted transition hover:bg-ink/[0.04] hover:text-ink"
        >
          <LogOutIcon size={15} />
          Log out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-canvas/95 px-4 py-3 backdrop-blur min-[900px]:hidden">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
            QuickMenu QR
          </p>
          <p className="display truncate text-[17px] leading-tight text-ink">
            {restaurant?.name}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-controls="dashboard-sidebar"
          className="flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-2 text-[12.5px] font-medium text-ink"
        >
          Menu
        </button>
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-40 flex min-[900px]:hidden">
          <div
            className="absolute inset-0 bg-ink/40 animate-fade-in"
            onClick={() => setMenuOpen(false)}
            aria-hidden
          />
          <aside
            id="dashboard-sidebar"
            className="relative z-10 h-full w-72 max-w-[85%] animate-sheet-up rounded-r-2xl bg-surface shadow-lift"
          >
            {sidebar}
          </aside>
        </div>
      )}

      <div className="min-[900px]:flex">
        <aside
          id="dashboard-sidebar"
          className="sticky top-0 hidden h-screen w-[248px] shrink-0 border-r border-line min-[900px]:block"
        >
          {sidebar}
        </aside>
        <main className="min-w-0 flex-1 px-4 py-5 sm:px-7 sm:py-7">{children}</main>
      </div>
    </div>
  );
}
