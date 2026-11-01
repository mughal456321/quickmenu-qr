"use client";

import { useCallback, useEffect, useState } from "react";
import type { AuthSession, KitchenOrder, OrderStatus } from "@quickmenu/shared";
import { ApiRequestError, apiRequest, formatPrice } from "../../../lib/api";
import {
  clearStaffToken,
  getStaffToken,
  saveStaffToken,
} from "../../../lib/storage";

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
  new: "bg-blue-100 text-blue-700",
  preparing: "bg-amber-100 text-amber-700",
  ready: "bg-green-100 text-green-700",
  served: "bg-gray-100 text-gray-600",
  cancelled: "bg-red-100 text-red-700",
};

export default function StaffOrdersPage() {
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
    const stored = getStaffToken();
    setToken(stored);
    setChecking(false);
    if (stored) void loadOrders(stored);
  }, [loadOrders]);

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
    setToken(null);
    setOrders(null);
  }

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center text-gray-500">
        Loading…
      </main>
    );
  }

  if (!token) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
        <form
          onSubmit={(event) => void login(event)}
          className="w-full max-w-sm space-y-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
        >
          <div>
            <h1 className="text-xl font-bold text-gray-900">Staff orders</h1>
            <p className="text-sm text-gray-500">
              Log in with an owner or kitchen account.
            </p>
          </div>
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </label>
          {loginError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {loginError}
            </p>
          )}
          <button
            type="submit"
            disabled={loggingIn}
            className="w-full rounded-xl bg-orange-500 px-4 py-3 font-semibold text-white disabled:opacity-60"
          >
            {loggingIn ? "Logging in…" : "Log in"}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Kitchen orders</h1>
            <p className="text-xs text-gray-500">Active orders for your restaurant</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => token && void loadOrders(token)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={logout}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-5xl space-y-3 p-4">
        {listError && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {listError}
          </p>
        )}

        {orders && orders.length === 0 && (
          <p className="rounded-xl bg-white px-4 py-10 text-center text-gray-500">
            No active orders right now.
          </p>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          {orders?.map((order) => (
            <article
              key={order.id}
              className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">
                    #{order.orderNumber}
                  </h2>
                  <p className="text-sm text-gray-500">Table {order.table.number}</p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${STATUS_STYLES[order.status]}`}
                >
                  {order.status}
                </span>
              </div>

              <ul className="mt-3 space-y-1 text-sm">
                {order.items.map((item, index) => (
                  <li key={`${order.id}-${item.name}-${index}`} className="text-gray-700">
                    <span className="font-semibold">{item.quantity} ×</span> {item.name}
                    {item.variant ? ` (${item.variant})` : ""}
                    {item.specialInstructions && (
                      <span className="block text-xs italic text-gray-500">
                        “{item.specialInstructions}”
                      </span>
                    )}
                  </li>
                ))}
              </ul>

              {order.notes && (
                <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Note: {order.notes}
                </p>
              )}

              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-gray-500">
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
                      className={`rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-60 ${
                        status === "cancelled" ? "bg-red-600" : "bg-orange-500"
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
