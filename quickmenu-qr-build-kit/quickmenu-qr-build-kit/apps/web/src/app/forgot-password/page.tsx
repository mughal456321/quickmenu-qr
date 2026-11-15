"use client";

import Link from "next/link";
import { useState } from "react";
import { forgotPasswordSchema } from "@quickmenu/shared";
import { ApiRequestError, apiRequest } from "../../lib/api";
import {
  authShellClass,
  cardClass,
  eyebrowClass,
  inputClass,
  labelClass,
  primaryButton,
} from "../../components/ui";
import { ArrowLeftIcon } from "../../components/icons";

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
      <div className="w-full max-w-[400px]">
        <div className="mb-6 text-center">
          <p className={eyebrowClass}>QuickMenu QR</p>
          <h1 className="display mt-2 text-[30px] leading-none text-ink">
            Reset your password
          </h1>
          <p className="mx-auto mt-2 max-w-[36ch] text-[13px] leading-relaxed text-muted">
            Enter your account email and we will send a link valid for 30 minutes.
          </p>
        </div>

        <form
          onSubmit={(event) => void onSubmit(event)}
          className={`space-y-4 p-5 sm:p-6 ${cardClass}`}
        >
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
            {busy ? "Sending…" : "Send reset link"}
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
