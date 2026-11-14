"use client";

import { AuthProvider } from "../lib/auth";
import { ToastProvider } from "../components/Toast";

/** Client providers shared by every route. */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ToastProvider>{children}</ToastProvider>
    </AuthProvider>
  );
}
