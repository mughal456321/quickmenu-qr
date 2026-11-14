"use client";

import Link from "next/link";
import { useState } from "react";
import { forgotPasswordSchema } from "@quickmenu/shared";
import { ApiRequestError, apiRequest } from "../../lib/api";
import {
  authShellClass,
  cardClass,
  inputClass,
  labelClass,
  primaryButton,
} from "../../components/ui";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter a valid email.");
      return;
    }

    setBusy(true);
    try {
      const result = await apiRequest<{ message: string }>("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify(parsed.data),
      });
      setMessage(result.message);
    } catch (requestError) {
      setError(
        requestError instanceof ApiRequestError
          ? requestError.message
          : "Could not send the reset link. Please try again."
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
            <h1 className="text-xl font-bold text-gray-900">Reset your password</h1>
            <p className="mt-1 text-sm text-gray-500">
              Enter your account email and we will send a link valid for 30 minutes.
            </p>
          </div>

          <label className={labelClass}>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={inputClass}
              autoComplete="email"
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
            {busy ? "Sending…" : "Send reset link"}
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
