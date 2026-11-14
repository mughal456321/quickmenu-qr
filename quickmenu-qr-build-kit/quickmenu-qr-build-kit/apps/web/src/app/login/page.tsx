"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { loginSchema } from "@quickmenu/shared";
import { ApiRequestError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import {
  authShellClass,
  cardClass,
  inputClass,
  labelClass,
  primaryButton,
} from "../../components/ui";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, status, user } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status !== "authenticated" || !user) return;
    const next = searchParams.get("next");
    const target =
      user.role === "kitchen" ? "/kitchen" : next ?? "/dashboard/menu";
    router.replace(target);
  }, [status, user, router, searchParams]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        errors[String(issue.path[0])] ??= issue.message;
      }
      setFieldErrors(errors);
      return;
    }

    setBusy(true);
    try {
      await login(parsed.data.email, parsed.data.password);
    } catch (requestError) {
      if (requestError instanceof ApiRequestError) {
        setError(
          requestError.code === "ACCOUNT_LOCKED"
            ? "Too many failed attempts. Try again in 15 minutes."
            : requestError.message
        );
      } else {
        setError("Could not log in. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={authShellClass}>
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Sign in to QuickMenu QR
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Owners manage the menu; kitchen staff see live orders.
          </p>
        </div>

        <form onSubmit={(event) => void onSubmit(event)} className={`space-y-4 ${cardClass}`}>
          <label className={labelClass}>
            Email
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={inputClass}
              aria-invalid={Boolean(fieldErrors.email)}
            />
            {fieldErrors.email && (
              <span className="mt-1 block text-xs text-red-600">{fieldErrors.email}</span>
            )}
          </label>

          <label className={labelClass}>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={inputClass}
              aria-invalid={Boolean(fieldErrors.password)}
            />
            {fieldErrors.password && (
              <span className="mt-1 block text-xs text-red-600">
                {fieldErrors.password}
              </span>
            )}
          </label>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {error}
            </p>
          )}

          <button type="submit" disabled={busy} className={`w-full ${primaryButton}`}>
            {busy ? "Signing in…" : "Log in"}
          </button>

          <div className="flex items-center justify-between text-sm">
            <Link href="/forgot-password" className="font-medium text-orange-600">
              Forgot password?
            </Link>
            <Link href="/register" className="font-medium text-orange-600">
              Create an account
            </Link>
          </div>
        </form>

        <div className="mt-4 rounded-xl border border-dashed border-gray-300 bg-white/60 p-3 text-xs text-gray-500">
          <p className="font-semibold text-gray-600">Demo accounts (seeded data)</p>
          <p>Owner: owner@cafearoma.pk · Kitchen: kitchen@cafearoma.pk</p>
          <p>Passwords are in the Week 6 demo notes.</p>
        </div>

        <p className="mt-4 text-center text-sm text-gray-500">
          <Link href="/" className="underline">
            Back to home
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={<main className={authShellClass}>Loading…</main>}
    >
      <LoginForm />
    </Suspense>
  );
}
