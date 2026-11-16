"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { resetPasswordSchema } from "@quickmenu/shared";
import { ApiRequestError, apiVoid } from "../../lib/api";
import {
  authShellClass,
  cardClass,
  eyebrowClass,
  inputClass,
  labelClass,
  primaryButton,
} from "../../components/ui";
import { ArrowLeftIcon } from "../../components/icons";

function ResetForm() {
  const searchParams = useSearchParams();
  const [token, setToken] = useState(searchParams.get("token") ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }
    const parsed = resetPasswordSchema.safeParse({ token, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the form and try again.");
      return;
    }

    setBusy(true);
    try {
      await apiVoid("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify(parsed.data),
      });
      setMessage("Your password has been updated. You can now log in.");
      setPassword("");
      setConfirm("");
    } catch (requestError) {
      setError(
        requestError instanceof ApiRequestError
          ? requestError.message
          : "Could not reset the password. Please try again."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={authShellClass}>
      <div className="w-full max-w-[400px]">
        <div className="mb-6 text-center">
          <p className={eyebrowClass}>QuickMenu QR</p>
          <h1 className="display mt-2 text-[30px] leading-none text-ink">
            Choose a new password
          </h1>
          <p className="mx-auto mt-2 max-w-[36ch] text-[13px] leading-relaxed text-muted">
            Reset links are single use and expire after 30 minutes.
          </p>
        </div>

        <form
          onSubmit={(event) => void onSubmit(event)}
          className={`space-y-4 p-5 sm:p-6 ${cardClass}`}
        >
          <label className={labelClass}>
            Reset token
            <input
              value={token}
              onChange={(event) => setToken(event.target.value)}
              className={inputClass}
              autoComplete="one-time-code"
            />
          </label>

          <label className={labelClass}>
            New password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={inputClass}
              autoComplete="new-password"
            />
          </label>

          <label className={labelClass}>
            Confirm new password
            <input
              type="password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              className={inputClass}
              autoComplete="new-password"
            />
          </label>

          {message && (
            <p
              className="rounded-xl bg-success-soft px-3 py-2.5 text-[12.5px] text-success"
              role="status"
            >
              {message}
            </p>
          )}
          {error && (
            <p
              className="rounded-xl bg-danger-soft px-3 py-2.5 text-[12.5px] text-danger"
              role="alert"
            >
              {error}
            </p>
          )}

          <button type="submit" disabled={busy} className={`w-full ${primaryButton}`}>
            {busy ? "Saving…" : "Set new password"}
          </button>

          <p className="text-center text-[12.5px] text-muted">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 font-medium text-ink2 underline underline-offset-4 transition hover:text-ink"
            >
              <ArrowLeftIcon size={14} />
              Back to login
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className={authShellClass}>
          <p className="text-[13px] text-muted">Loading…</p>
        </main>
      }
    >
      <ResetForm />
    </Suspense>
  );
}
