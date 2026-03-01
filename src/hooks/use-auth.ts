"use client";

import * as React from "react";
import type { HealthGateUser, SessionStatusResponse } from "@/types/auth";

interface UseAuthReturn {
  user: HealthGateUser | null;
  authenticated: boolean;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<{ mfaRequired: boolean }>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

export function useAuth(): UseAuthReturn {
  const [user, setUser] = React.useState<HealthGateUser | null>(null);
  const [authenticated, setAuthenticated] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Check session on mount
  React.useEffect(() => {
    checkSession();
  }, []);

  async function checkSession() {
    try {
      const res = await fetch("/api/auth/session");
      const data: SessionStatusResponse = await res.json();
      setAuthenticated(data.authenticated);
      setUser(data.user);
    } catch {
      setAuthenticated(false);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  async function login(email: string, password: string) {
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || "Login failed");
    }

    const data = await res.json();
    if (!data.mfaRequired) {
      await checkSession();
    }
    return { mfaRequired: !!data.mfaRequired };
  }

  async function logout() {
    const res = await fetch("/api/auth/logout", { method: "POST" });
    const data = await res.json();
    setAuthenticated(false);
    setUser(null);

    // Broadcast logout to other tabs
    try {
      const bc = new BroadcastChannel("healthgate-session");
      bc.postMessage({ type: "LOGOUT" });
      bc.close();
    } catch {
      // Fallback: localStorage event
      localStorage.setItem(
        "healthgate-session-sync",
        JSON.stringify({ type: "LOGOUT", timestamp: Date.now() }),
      );
    }

    if (data.redirectTo) {
      window.location.href = data.redirectTo;
    }
  }

  async function refreshSession() {
    try {
      const res = await fetch("/api/auth/refresh", { method: "POST" });
      if (!res.ok) {
        setAuthenticated(false);
        setUser(null);
        window.location.href = "/session-expired";
        return;
      }

      // Broadcast session extension to other tabs
      try {
        const bc = new BroadcastChannel("healthgate-session");
        bc.postMessage({ type: "EXTEND", newExpiry: Date.now() + 900000 });
        bc.close();
      } catch {
        localStorage.setItem(
          "healthgate-session-sync",
          JSON.stringify({ type: "EXTEND", timestamp: Date.now() }),
        );
      }

      await checkSession();
    } catch {
      window.location.href = "/session-expired";
    }
  }

  // Listen for cross-tab session events
  React.useEffect(() => {
    function handleBroadcast(event: MessageEvent) {
      if (event.data.type === "LOGOUT") {
        setAuthenticated(false);
        setUser(null);
        window.location.href = "/login";
      }
      if (event.data.type === "SESSION_EXPIRED") {
        setAuthenticated(false);
        setUser(null);
        window.location.href = "/session-expired";
      }
    }

    try {
      const bc = new BroadcastChannel("healthgate-session");
      bc.addEventListener("message", handleBroadcast);
      return () => {
        bc.removeEventListener("message", handleBroadcast);
        bc.close();
      };
    } catch {
      // Fallback: localStorage event listener
      const handleStorage = (e: StorageEvent) => {
        if (e.key === "healthgate-session-sync" && e.newValue) {
          const data = JSON.parse(e.newValue);
          if (data.type === "LOGOUT") {
            window.location.href = "/login";
          }
        }
      };
      window.addEventListener("storage", handleStorage);
      return () => window.removeEventListener("storage", handleStorage);
    }
  }, []);

  return { user, authenticated, loading, error, login, logout, refreshSession };
}
