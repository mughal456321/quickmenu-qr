"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  AuthSession,
  AuthUser,
  MeResponse,
  RegisterInput,
  Restaurant,
} from "@quickmenu/shared";
import { apiRequest, apiVoid, setAccessToken } from "./api";

export type AuthStatus = "loading" | "authenticated" | "anonymous";

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  restaurant: Restaurant | null;
  accessToken: string | null;
  login(email: string, password: string): Promise<AuthSession>;
  register(input: RegisterInput): Promise<AuthSession>;
  logout(): Promise<void>;
  refresh(): Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Auth context (FR-02, FR-03, NFR-S3).
 *
 * The access token lives in memory only. A refresh token in an HttpOnly cookie
 * restores the session after a reload; the short-lived access token never
 * touches localStorage.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [accessTokenState, setAccessTokenState] = useState<string | null>(null);

  const applySession = useCallback(async (session: AuthSession) => {
    setAccessToken(session.accessToken);
    setAccessTokenState(session.accessToken);
    setUser(session.user);
    const me = await apiRequest<MeResponse>("/me");
    setRestaurant(me.restaurant);
    setUser(me.user);
    setStatus("authenticated");
  }, []);

  const refresh = useCallback(async (): Promise<string | null> => {
    try {
      const session = await apiRequest<AuthSession>("/auth/refresh", {
        method: "POST",
      });
      await applySession(session);
      return session.accessToken;
    } catch {
      setAccessToken(null);
      setAccessTokenState(null);
      setUser(null);
      setRestaurant(null);
      setStatus("anonymous");
      return null;
    }
  }, [applySession]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const session = await apiRequest<AuthSession>("/auth/refresh", {
          method: "POST",
        });
        if (cancelled) return;
        await applySession(session);
      } catch {
        if (cancelled) return;
        setAccessToken(null);
        setStatus("anonymous");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applySession]);

  const login = useCallback(
    async (email: string, password: string) => {
      const session = await apiRequest<AuthSession>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      await applySession(session);
      return session;
    },
    [applySession]
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      const session = await apiRequest<AuthSession>("/auth/register", {
        method: "POST",
        body: JSON.stringify(input),
      });
      await applySession(session);
      return session;
    },
    [applySession]
  );

  const logout = useCallback(async () => {
    try {
      await apiVoid("/auth/logout", { method: "POST" });
    } finally {
      setAccessToken(null);
      setAccessTokenState(null);
      setUser(null);
      setRestaurant(null);
      setStatus("anonymous");
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      restaurant,
      accessToken: accessTokenState,
      login,
      register,
      logout,
      refresh,
    }),
    [
      status,
      user,
      restaurant,
      accessTokenState,
      login,
      register,
      logout,
      refresh,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
