"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SUPPORTED_LANGUAGES, registerSchema } from "@quickmenu/shared";
import { ApiRequestError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import {
  authShellClass,
  cardClass,
  inputClass,
  labelClass,
  primaryButton,
} from "../../components/ui";

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    restaurantName: "",
    defaultLanguage: "en",
    currency: "PKR",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function update(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const parsed = registerSchema.safeParse(form);
    if (!parsed.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        nextErrors[String(issue.path[0])] ??= issue.message;
      }
      setErrors(nextErrors);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await register(parsed.data);
      router.replace("/dashboard/menu");
    } catch (requestError) {
      if (requestError instanceof ApiRequestError && requestError.code === "CONFLICT") {
        setError("An account with that email already exists.");
      } else {
        setError(
          requestError instanceof ApiRequestError
            ? requestError.message
            : "Could not create the account. Please try again."
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={authShellClass}>
      <div className="w-full max-w-lg">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Create your restaurant
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            You get a menu builder, table QR codes and a live kitchen board.
          </p>
        </div>

        <form
          onSubmit={(event) => void onSubmit(event)}
          className={`space-y-4 ${cardClass}`}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="register-name">
                Your name
              </label>
              <input
                id="register-name"
                value={form.name}
                onChange={(event) => update("name", event.target.value)}
                className={inputClass}
                autoComplete="name"
              />
              {errors.name && (
                <span className="mt-1 block text-xs text-red-600">{errors.name}</span>
              )}
            </div>

            <div>
              <label className={labelClass} htmlFor="register-restaurant">
                Restaurant name
              </label>
              <input
                id="register-restaurant"
                value={form.restaurantName}
                onChange={(event) => update("restaurantName", event.target.value)}
                className={inputClass}
                autoComplete="organization"
              />
              {errors.restaurantName && (
                <span className="mt-1 block text-xs text-red-600">
                  {errors.restaurantName}
                </span>
              )}
            </div>
          </div>

          <div>
            <label className={labelClass} htmlFor="register-email">
              Email
            </label>
            <input
              id="register-email"
              type="email"
              value={form.email}
              onChange={(event) => update("email", event.target.value)}
              className={inputClass}
              autoComplete="email"
            />
            {errors.email && (
              <span className="mt-1 block text-xs text-red-600">{errors.email}</span>
            )}
          </div>

          <div>
            <label className={labelClass} htmlFor="register-password">
              Password
            </label>
            <input
              id="register-password"
              type="password"
              value={form.password}
              onChange={(event) => update("password", event.target.value)}
              className={inputClass}
              autoComplete="new-password"
            />
            <span className="mt-1 block text-xs text-gray-500">
              At least 8 characters, with a letter and a number.
            </span>
            {errors.password && (
              <span className="mt-1 block text-xs text-red-600">{errors.password}</span>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelClass}>
              Default menu language
              <select
                value={form.defaultLanguage}
                onChange={(event) => update("defaultLanguage", event.target.value)}
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
                onChange={(event) => update("currency", event.target.value.toUpperCase())}
                maxLength={3}
                className={inputClass}
              />
              {errors.currency && (
                <span className="mt-1 block text-xs text-red-600">{errors.currency}</span>
              )}
            </label>
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {error}
            </p>
          )}

          <button type="submit" disabled={busy} className={`w-full ${primaryButton}`}>
            {busy ? "Creating account…" : "Create account"}
          </button>

          <p className="text-center text-sm text-gray-500">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-orange-600">
              Log in
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
