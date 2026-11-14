"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { resetPasswordSchema } from "@quickmenu/shared";
import { ApiRequestError, apiVoid } from "../../lib/api";
import {
  authShellClass,
  cardClass,
  inputClass,
  labelClass,
  primaryButton,
} from "../../components/ui";

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
      <div className="w-full max-w-md">
        <form onSubmit={(event) => void onSubmit(event)} className={`space-y-4 ${cardClass}`}>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Choose a new password</h1>
            <p className="mt-1 text-sm text-gray-500">
              Reset links are single use and expire after 30 minutes.
            </p>
          </div>

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
            <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800" role="status">
              {message}
            </p>
          )}
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {error}
            </p>
          )}

          <button type="submit" disabled={busy} className={`w-full ${primaryButton}`}>
            {busy ? "Saving…" : "Set new password"}
          </button>

          <p className="text-center text-sm text-gray-500">
            <Link href="/login" className="font-medium text-orange-600">
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
    <Suspense fallback={<main className={authShellClass}>Loading…</main>}>
      <ResetForm />
    </Suspense>
  );
}
