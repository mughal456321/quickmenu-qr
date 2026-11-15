"use client";

import { useCallback, useEffect, useState } from "react";
import { passwordSchema, staffCreateSchema } from "@quickmenu/shared";
import type { User } from "@quickmenu/shared";
import { ApiRequestError, apiRequest } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import { useToast } from "../../../components/Toast";
import {
  cardClass,
  eyebrowClass,
  inputClass,
  labelClass,
  primaryButton,
  secondaryButton,
} from "../../../components/ui";

export default function StaffPage() {
  const { refresh } = useAuth();
  const toast = useToast();

  const [staff, setStaff] = useState<User[] | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [resetId, setResetId] = useState<string | null>(null);
  const [resetValue, setResetValue] = useState("");

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
      setStaff(await apiRequest<User[]>("/staff"));
    } catch (error) {
      if (await handleAuthError(error)) return;
      toast.push(
        error instanceof ApiRequestError ? error.message : "Could not load staff.",
        "error"
      );
    }
  }, [handleAuthError, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createStaff(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    const parsed = staffCreateSchema.safeParse(form);
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
      await apiRequest("/staff", {
        method: "POST",
        body: JSON.stringify(parsed.data),
      });
      setForm({ name: "", email: "", password: "" });
      toast.push("Kitchen account created.", "success");
      await load();
    } catch (error) {
      if (await handleAuthError(error)) return;
      toast.push(
        error instanceof ApiRequestError ? error.message : "Could not create the account.",
        "error"
      );
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(user: User) {
    setPendingId(user.id);
    try {
      await apiRequest(`/staff/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      toast.push(user.isActive ? "Account deactivated." : "Account activated.", "success");
      await load();
    } catch (error) {
      if (await handleAuthError(error)) return;
      toast.push(
        error instanceof ApiRequestError ? error.message : "Could not update the account.",
        "error"
      );
    } finally {
      setPendingId(null);
    }
  }

  async function resetPassword(user: User) {
    const parsed = passwordSchema.safeParse(resetValue);
    if (!parsed.success) {
      toast.push(parsed.error.issues[0]?.message ?? "Choose a stronger password.", "error");
      return;
    }
    setPendingId(user.id);
    try {
      await apiRequest(`/staff/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ password: parsed.data }),
      });
      toast.push("Password updated.", "success");
      setResetId(null);
      setResetValue("");
    } catch (error) {
      if (await handleAuthError(error)) return;
      toast.push(
        error instanceof ApiRequestError ? error.message : "Could not reset the password.",
        "error"
      );
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <p className={eyebrowClass}>Team</p>
        <h1 className="display mt-1.5 text-[30px] leading-none text-ink">Staff</h1>
        <p className="mt-1.5 text-[13px] text-muted">
          Kitchen accounts can open the kitchen board, but not the owner dashboard.
        </p>
      </div>

      <form
        onSubmit={(event) => void createStaff(event)}
        className={`${cardClass} space-y-3 p-4 sm:p-5`}
      >
        <h2 className="display text-[22px] leading-tight text-ink">
          Create a kitchen account
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className={labelClass}>
            Name
            <input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              className={inputClass}
              autoComplete="off"
            />
            {errors.name && <span className="text-xs text-danger">{errors.name}</span>}
          </label>
          <label className={labelClass}>
            Email
            <input
              type="email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              className={inputClass}
              autoComplete="off"
            />
            {errors.email && <span className="text-xs text-danger">{errors.email}</span>}
          </label>
          <label className={labelClass}>
            Temporary password
            <input
              type="password"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              className={inputClass}
              autoComplete="new-password"
            />
            {errors.password && (
              <span className="text-xs text-danger">{errors.password}</span>
            )}
          </label>
        </div>
        <button type="submit" disabled={busy} className={primaryButton}>
          {busy ? "Creating…" : "Create account"}
        </button>
      </form>

      <section className={`${cardClass} p-4 sm:p-5`} aria-labelledby="staff-list-heading">
        <h2 id="staff-list-heading" className="display text-[22px] leading-tight text-ink">
          Kitchen accounts
        </h2>

        {staff === null && (
          <p className="mt-3 flex items-center gap-3 text-[13px] text-muted" role="status">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-ink" />
            Loading staff…
          </p>
        )}
        {staff?.length === 0 && (
          <p className="mt-3 text-[13px] text-muted">No kitchen accounts yet.</p>
        )}

        <ul className="mt-3 divide-y divide-line">
          {staff?.map((user) => (
            <li key={user.id} className="py-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[14px] font-medium text-ink">{user.name}</p>
                  <p className="text-[12.5px] text-muted">{user.email}</p>
                  <span
                    className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] ${
                      user.isActive
                        ? "bg-success-soft text-success"
                        : "bg-canvas text-muted ring-1 ring-line"
                    }`}
                  >
                    {user.isActive ? "Active" : "Deactivated"}
                  </span>
                  {user.lockedUntil && (
                    <span className="ml-2 text-[11.5px] text-danger">
                      Locked until {new Date(user.lockedUntil).toLocaleTimeString()}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setResetId(resetId === user.id ? null : user.id);
                      setResetValue("");
                    }}
                    className={secondaryButton}
                  >
                    Reset password
                  </button>
                  <button
                    type="button"
                    disabled={pendingId === user.id}
                    onClick={() => void toggleActive(user)}
                    className={secondaryButton}
                  >
                    {user.isActive ? "Deactivate" : "Activate"}
                  </button>
                </div>
              </div>

              {resetId === user.id && (
                <div className="mt-2.5 flex flex-wrap items-end gap-2 rounded-xl border border-line bg-canvas p-3">
                  <label className={`${labelClass} min-w-[220px] flex-1`}>
                    New password for {user.name}
                    <input
                      type="password"
                      value={resetValue}
                      onChange={(event) => setResetValue(event.target.value)}
                      className={inputClass}
                      autoComplete="new-password"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={pendingId === user.id}
                    onClick={() => void resetPassword(user)}
                    className={primaryButton}
                  >
                    Save password
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
