"use client";

import { useCallback, useEffect, useState } from "react";
import { SUPPORTED_LANGUAGES, restaurantUpdateSchema } from "@quickmenu/shared";
import type { Restaurant } from "@quickmenu/shared";
import { ApiRequestError, apiRequest } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import { useToast } from "../../../components/Toast";
import {
  cardClass,
  inputClass,
  labelClass,
  primaryButton,
} from "../../../components/ui";

export default function SettingsPage() {
  const { refresh, user } = useAuth();
  const toast = useToast();

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [form, setForm] = useState({
    name: "",
    defaultLanguage: "en",
    currency: "PKR",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const handleAuthError = useCallback(
    async (error: unknown): Promise<boolean> => {
      if (error instanceof ApiRequestError && error.status === 401) {
        const token = await refresh();
        if (!token) toast.push("Your session expired. Please log in again.", "error");
        return true;
      }
      return false;
    },
    [refresh, toast]
  );

  const load = useCallback(async () => {
    try {
      const data = await apiRequest<Restaurant>("/restaurant");
      setRestaurant(data);
      setForm({
        name: data.name,
        defaultLanguage: data.defaultLanguage,
        currency: data.currency,
      });
    } catch (error) {
      if (await handleAuthError(error)) return;
      toast.push(
        error instanceof ApiRequestError ? error.message : "Could not load settings.",
        "error"
      );
    }
  }, [handleAuthError, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    const parsed = restaurantUpdateSchema.safeParse(form);
    if (!parsed.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        nextErrors[String(issue.path[0])] ??= issue.message;
      }
      setErrors(nextErrors);
      return;
    }

    setBusy(true);
    try {
      const updated = await apiRequest<Restaurant>("/restaurant", {
        method: "PATCH",
        body: JSON.stringify(parsed.data),
      });
      setRestaurant(updated);
      toast.push("Restaurant profile updated.", "success");
    } catch (error) {
      if (await handleAuthError(error)) return;
      toast.push(
        error instanceof ApiRequestError ? error.message : "Could not save settings.",
        "error"
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500">
          Restaurant profile and the defaults used on every table menu.
        </p>
      </div>

      <form onSubmit={(event) => void save(event)} className={`${cardClass} space-y-4`}>
        <label className={labelClass}>
          Restaurant name
          <input
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            className={inputClass}
          />
          {errors.name && <span className="text-xs text-red-600">{errors.name}</span>}
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>
            Menu source language
            <select
              value={form.defaultLanguage}
              onChange={(event) =>
                setForm({ ...form, defaultLanguage: event.target.value })
              }
              className={inputClass}
            >
              {SUPPORTED_LANGUAGES.map((language) => (
                <option key={language.code} value={language.code}>
                  {language.name} ({language.nativeName})
                </option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            Currency
            <input
              value={form.currency}
              maxLength={3}
              onChange={(event) =>
                setForm({ ...form, currency: event.target.value.toUpperCase() })
              }
              className={inputClass}
            />
            {errors.currency && (
              <span className="text-xs text-red-600">{errors.currency}</span>
            )}
          </label>
        </div>

        <button type="submit" disabled={busy} className={primaryButton}>
          {busy ? "Saving…" : "Save changes"}
        </button>
      </form>

      <section className={`${cardClass} text-sm text-gray-600`}>
        <h2 className="text-lg font-bold text-gray-900">Account</h2>
        <dl className="mt-3 grid gap-2 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-gray-400">Signed in as</dt>
            <dd className="font-medium text-gray-800">{user?.email}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-gray-400">Role</dt>
            <dd className="font-medium capitalize text-gray-800">{user?.role}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-gray-400">Menu slug</dt>
            <dd className="font-medium text-gray-800">{restaurant?.slug}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-gray-400">
              Orders processed
            </dt>
            <dd className="font-medium text-gray-800">
              {restaurant?.orderCounter ?? 0}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
