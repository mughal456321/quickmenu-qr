"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "../../lib/auth";

const NAV_ITEMS = [
  { href: "/dashboard/menu", label: "Menu Builder", hint: "Categories and items" },
  { href: "/dashboard/tables", label: "Tables & QR", hint: "Print table codes" },
  { href: "/dashboard/orders", label: "Orders", hint: "Staff order board" },
  { href: "/dashboard/staff", label: "Staff", hint: "Kitchen accounts" },
  { href: "/dashboard/settings", label: "Settings", hint: "Restaurant profile" },
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
      <main className="flex min-h-screen items-center justify-center bg-gray-50 text-gray-500">
        <p role="status">Loading your dashboard…</p>
      </main>
    );
  }

  async function signOut() {
    await logout();
    router.replace("/login");
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-200 px-5 py-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">
          QuickMenu QR
        </p>
        <p className="mt-1 text-lg font-bold text-gray-900">
          {restaurant?.name ?? "Owner dashboard"}
        </p>
        <p className="truncate text-xs text-gray-500">{user.email}</p>
      </div>

      <nav aria-label="Dashboard" className="flex-1 space-y-1 px-3 py-4">
        {NAV_ITEMS.map((item) => {
          const active =
            pathname === item.href ||
            (item.href === "/dashboard/menu" && pathname === "/dashboard");
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`block rounded-xl px-3 py-2.5 text-sm ${
                active
                  ? "bg-orange-50 font-semibold text-orange-700"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              <span className="block">{item.label}</span>
              <span className="block text-xs font-normal text-gray-400">
                {item.hint}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="space-y-2 border-t border-gray-200 p-4">
        <Link
          href="/kitchen"
          className="block rounded-lg border border-gray-300 px-3 py-2 text-center text-sm font-medium text-gray-700"
        >
          Open kitchen board
        </Link>
        <button
          type="button"
          onClick={() => void signOut()}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700"
        >
          Log out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 min-[900px]:hidden">
        <div>
          <p className="text-sm font-bold text-gray-900">QuickMenu QR</p>
          <p className="text-xs text-gray-500">{restaurant?.name}</p>
        </div>
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-controls="dashboard-sidebar"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium"
        >
          Menu
        </button>
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-40 flex min-[900px]:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMenuOpen(false)}
            aria-hidden
          />
          <aside
            id="dashboard-sidebar"
            className="relative z-10 h-full w-72 max-w-[85%] bg-white shadow-xl"
          >
            {sidebar}
          </aside>
        </div>
      )}

      <div className="min-[900px]:flex">
        <aside
          id="dashboard-sidebar"
          className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-gray-200 bg-white min-[900px]:block"
        >
          {sidebar}
        </aside>
        <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
