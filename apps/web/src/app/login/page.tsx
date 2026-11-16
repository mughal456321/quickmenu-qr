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
    <main className="min-h-screen bg-canvas lg:grid lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-[#EFE5D6] lg:block">
        <img
          src="/demo/chicken-biryani.jpg"
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#151412]/85 via-[#151412]/25 to-transparent" />
        <div className="relative flex h-full flex-col justify-between p-10">
          <Link href="/" className="flex items-center gap-2.5 text-canvas">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-canvas text-[13px] font-semibold text-ink">
              Q
            </span>
            <span className="text-[15px] font-semibold tracking-tight">QuickMenu</span>
          </Link>
          <div className="max-w-[30ch]">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-canvas/60">
              Cafe Aroma · Table service
            </p>
            <p className="display mt-3 text-[30px] leading-[1.1] text-canvas">
              &ldquo;Tickets land at the pass before the guest puts the phone
              down.&rdquo;
            </p>
            <p className="mt-4 text-[12.5px] text-canvas/70">
              Live menu, live orders, one QR code per table.
            </p>
          </div>
        </div>
      </aside>

      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-[400px]">
          <div className="mb-7">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
              QuickMenu QR
            </p>
            <h1 className="display mt-2 text-[32px] leading-none text-ink">
              Welcome back
            </h1>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">
              Owners manage the menu; kitchen staff see live orders.
            </p>
          </div>

          <form
            onSubmit={(event) => void onSubmit(event)}
            className={`space-y-4 p-5 ${cardClass}`}
          >
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
                <span className="mt-1 block text-xs text-danger">{fieldErrors.email}</span>
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
                <span className="mt-1 block text-xs text-danger">
                  {fieldErrors.password}
                </span>
              )}
            </label>

            {error && (
              <p
                className="rounded-xl bg-danger-soft px-3 py-2.5 text-[12.5px] text-danger"
                role="alert"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className={`w-full ${primaryButton}`}
            >
              {busy ? "Signing in…" : "Log in"}
            </button>

            <div className="flex items-center justify-between pt-1 text-[12.5px]">
              <Link href="/forgot-password" className="font-medium text-ink2 underline underline-offset-4">
                Forgot password?
              </Link>
              <Link href="/register" className="font-medium text-accent">
                Create an account
              </Link>
            </div>
          </form>

          <div className="mt-4 rounded-2xl border border-dashed border-line-strong px-4 py-3 text-[11.5px] leading-relaxed text-muted">
            <p className="font-semibold uppercase tracking-[0.12em] text-ink2">
              Demo accounts
            </p>
            <p className="mt-1">Owner: owner@cafearoma.pk</p>
            <p>Kitchen: kitchen@cafearoma.pk</p>
            <p className="mt-1">Passwords are in the Week 6 demo notes.</p>
          </div>

          <p className="mt-4 text-center text-[12.5px] text-muted">
            <Link href="/" className="underline underline-offset-4">
              Back to home
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className={authShellClass}>Loading…</main>}>
      <LoginForm />
    </Suspense>
  );
}
