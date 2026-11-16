"use client";

import { useEffect } from "react";

/**
 * Registers the service worker (public/sw.js) so the PWA shell and the last
 * public menu response are cached for offline use. Registration is best-effort
 * and disabled in development to avoid caching a hot-reloading app.
 */
export function ServiceWorkerRegistrar(): null {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Registration is best-effort; a failure must not break the app.
      });
    };

    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
