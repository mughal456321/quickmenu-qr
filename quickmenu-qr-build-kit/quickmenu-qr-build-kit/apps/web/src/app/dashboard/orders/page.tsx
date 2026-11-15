"use client";

import { useCallback, useEffect, useState } from "react";
import type { AuthSession, KitchenOrder, OrderStatus } from "@quickmenu/shared";
import { ApiRequestError, apiRequest, formatPrice } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import {
  clearStaffToken,
  getStaffToken,
  saveStaffToken,
} from "../../../lib/storage";
import {
  cardClass,
  eyebrowClass,
  ghostButton,
  inputClass,
  labelClass,
  primaryButton,
  secondaryButton,
} from "../../../components/ui";
import { BellIcon, ChefHatIcon, ClockIcon } from "../../../components/icons";

const NEXT_STATUSES: Record<OrderStatus, OrderStatus[]> = {
  new: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["served", "cancelled"],
  served: [],
  cancelled: [],
};

const ACTION_LABELS: Record<OrderStatus, string> = {
  new: "Mark received",
  preparing: "Start preparing",
  ready: "Mark ready",
  served: "Mark served",
  cancelled: "Cancel order",
};

const STATUS_STYLES: Record<OrderStatus, string> = {
  new: "bg-accent-soft text-accent",
  preparing: "bg-[#FBF0DC] text-[#8A5A05]",
  ready: "bg-success-soft text-success",
  served: "bg-success-soft text-success",
  cancelled: "bg-danger-soft text-danger",
};

export default function StaffOrdersPage() {
  const { accessToken, logout: clearSession } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  const [email, setEmail] = useState("owner@cafearoma.pk");
  const [password, setPassword] = useState("CafeAroma2026!");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  const [orders, setOrders] = useState<KitchenOrder[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const loadOrders = useCallback(async (accessToken: string) => {
    try {
      const data = await apiRequest<KitchenOrder[]>("/orders", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setOrders(data);
      setListError(null);
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 401) {
        clearStaffToken();
        setToken(null);
        setOrders(null);
        setListError("Your session expired. Please log in again.");
        return;
      }
      setListError(
        error instanceof ApiRequestError ? error.message : "Could not load orders."
      );
    }
  }, []);

  useEffect(() => {
    const stored = getStaffToken() ?? accessToken;
    if (accessToken) saveStaffToken(accessToken);
    setToken(stored);
    setChecking(false);
    if (stored) void loadOrders(stored);
  }, [accessToken, loadOrders]);

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoggingIn(true);
    setLoginError(null);
    try {
      const session = await apiRequest<AuthSession>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      saveStaffToken(session.accessToken);
      setToken(session.accessToken);
      await loadOrders(session.accessToken);
    } catch (error) {
      setLoginError(
        error instanceof ApiRequestError
          ? error.message
          : "Could not log in. Please try again."
      );
    } finally {
      setLoggingIn(false);
    }
  }

  async function advance(order: KitchenOrder, status: OrderStatus) {
    if (!token || pendingId) return;
    setPendingId(order.id);
    setListError(null);
    try {
      await apiRequest(`/orders/${order.id}/status`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      });
      await loadOrders(token);
    } catch (error) {
      setListError(
        error instanceof ApiRequestError ? error.message : "Could not update the order."
      );
    } finally {
      setPendingId(null);
    }
  }

  function logout() {
    clearStaffToken();
    void clearSession();
    setToken(null);
    setOrders(null);
  }

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas text-[13px] text-muted">
        Loading…
      </main>
    );
  }

  if (!token) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas p-4 sm:p-6">
        <form
          onSubmit={(event) => void login(event)}
          className={`w-full max-w-[380px] space-y-4 p-5 sm:p-6 ${cardClass}`}
        >
          <div>
            <h1 className="display text-[28px] leading-none text-ink">Staff orders</h1>
            <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
              Log in with an owner or kitchen account.
            </p>
          </div>
          <label className={labelClass}>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              className={inputClass}
            />
          </label>
          {loginError && (
            <p
              className="rounded-xl bg-danger-soft px-3 py-2.5 text-[12.5px] text-danger"
              role="alert"
            >
              {loginError}
            </p>
          )}
          <button
            type="submit"
            disabled={loggingIn}
            className={`w-full ${primaryButton}`}
          >
            {loggingIn ? "Logging in…" : "Log in"}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-10 border-b border-line bg-canvas/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <span className="hidden h-9 w-9 items-center justify-center rounded-full bg-ink text-canvas sm:flex">
              <ChefHatIcon size={17} />
            </span>
            <div>
              <h1 className="display text-[26px] leading-none text-ink">
                Kitchen orders
              </h1>
              <p className="mt-1 text-[11.5px] text-muted">
                Active orders for your restaurant
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => token && void loadOrders(token)}
              className={secondaryButton}
            >
              Refresh
            </button>
            <button type="button" onClick={logout} className={ghostButton}>
              Log out
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-5xl space-y-4 px-4 py-5 sm:py-6">
        {listError && (
          <p
            className="rounded-xl border border-danger/15 bg-danger-soft px-3.5 py-2.5 text-[12.5px] text-danger"
            role="alert"
          >
            {listError}
          </p>
        )}

        {orders && orders.length === 0 && (
          <div className="rounded-[18px] border border-dashed border-line-strong bg-surface px-5 py-14 text-center">
            <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-canvas text-muted">
              <BellIcon size={18} />
            </span>
            <p className="mt-3 text-[13px] text-muted">No active orders right now.</p>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          {orders?.map((order) => (
            <article
              key={order.id}
              className="animate-fade-in rounded-[18px] border border-line bg-surface p-4 transition hover:border-line-strong"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="display tabular text-[26px] leading-none text-ink">
                    #{order.orderNumber}
                  </h2>
                  <p className={`mt-1.5 ${eyebrowClass}`}>Table {order.table.number}</p>
                </div>
                <span
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_STYLES[order.status]}`}
                >
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
                  {order.status}
                </span>
              </div>

              <ul className="mt-3.5 space-y-1.5 border-t border-line pt-3">
                {order.items.map((item, index) => (
                  <li
                    key={`${order.id}-${item.name}-${index}`}
                    className="text-[13px] leading-snug text-ink2"
                  >
                    <span className="font-semibold tabular text-ink">
                      {item.quantity} ×
                    </span>{" "}
                    {item.name}
                    {item.variant ? ` (${item.variant})` : ""}
                    {item.specialInstructions && (
                      <span className="block text-[11.5px] italic text-muted">
                        “{item.specialInstructions}”
                      </span>
                    )}
                  </li>
                ))}
              </ul>

              {order.notes && (
                <p className="mt-3 rounded-xl border border-warn/15 bg-warn-soft px-3 py-2 text-[12.5px] text-warn">
                  Note: {order.notes}
                </p>
              )}

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 text-[11.5px] tabular text-muted">
                  <ClockIcon size={12} />
                  {order.items.reduce((total, item) => total + item.quantity, 0)} items ·{" "}
                  {formatPrice(
                    order.items.reduce(
                      (total, item) => total + item.unitPrice * item.quantity,
                      0
                    )
                  )}
                </span>
                <div className="flex gap-2">
                  {NEXT_STATUSES[order.status].map((status) => (
                    <button
                      key={status}
                      type="button"
                      disabled={pendingId === order.id}
                      onClick={() => void advance(order, status)}
                      className={`rounded-xl px-3.5 py-2 text-[12.5px] font-semibold transition disabled:opacity-50 ${
                        status === "cancelled"
                          ? "border border-danger/20 bg-danger-soft text-danger hover:border-danger/40"
                          : "bg-ink text-canvas hover:bg-ink2"
                      }`}
                    >
                      {ACTION_LABELS[status]}
                    </button>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
