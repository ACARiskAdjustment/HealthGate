"use client";

import * as React from "react";
import type {
  HealthGateUser,
  HealthGateError,
  HealthGateConfig,
  HealthGateContextValue,
  HealthGateProviderProps,
  LoginOptions,
  SessionStatusResponse,
} from "@/types/auth";
import { SessionTimeoutWarning } from "@/components/auth/session-timeout-warning";

const HealthGateContext = React.createContext<HealthGateContextValue | null>(null);

export function HealthGateProvider({
  keycloakUrl,
  realm,
  clientId,
  idleTimeoutMinutes = 15,
  sessionWarningMinutes = 2,
  onSessionExpired,
  onAuthError,
  loginUrl = "/login",
  children,
}: HealthGateProviderProps) {
  const [user, setUser] = React.useState<HealthGateUser | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [token, setToken] = React.useState<string | null>(null);
  const [sessionStartMs, setSessionStartMs] = React.useState(Date.now());
  const [expiresAt, setExpiresAt] = React.useState<Date | null>(null);

  // Session timeout state
  const [showWarning, setShowWarning] = React.useState(false);
  const [remainingMs, setRemainingMs] = React.useState(idleTimeoutMinutes * 60 * 1000);
  const lastActivityRef = React.useRef(Date.now());
  const broadcastRef = React.useRef<BroadcastChannel | null>(null);

  const idleTimeoutMs = idleTimeoutMinutes * 60 * 1000;
  const warningLeadMs = sessionWarningMinutes * 60 * 1000;
  const maxLifetimeMs = 12 * 60 * 60 * 1000; // 12 hours
  const checkIntervalMs = 10 * 1000;
  const clientAheadMs = 5000;
  const debounceMs = 1000;

  const config: HealthGateConfig = React.useMemo(
    () => ({
      keycloakUrl,
      realm,
      clientId,
      idleTimeoutMinutes,
      sessionWarningMinutes,
      onSessionExpired,
      onAuthError,
    }),
    [keycloakUrl, realm, clientId, idleTimeoutMinutes, sessionWarningMinutes, onSessionExpired, onAuthError],
  );

  const isAuthenticated = !!user;

  const roles = React.useMemo(() => {
    if (!user) return [];
    const clientRoleValues = Object.values(user.clientRoles).flat();
    return [...user.realmRoles, ...clientRoleValues];
  }, [user]);

  const hasRole = React.useCallback(
    (roleName: string) => roles.includes(roleName),
    [roles],
  );

  // --- Auth methods ---

  const checkSession = React.useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session");
      const data: SessionStatusResponse = await res.json();
      setUser(data.user);
      if (data.expiresAt) {
        setExpiresAt(new Date(data.expiresAt));
      }
      if (data.sessionStartedAt) {
        setSessionStartMs(new Date(data.sessionStartedAt).getTime());
      }
    } catch {
      setUser(null);
      setToken(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial session check
  React.useEffect(() => {
    checkSession();
  }, [checkSession]);

  const login = React.useCallback(
    (options?: LoginOptions) => {
      const redirect = options?.redirectUri
        ? `?redirect=${encodeURIComponent(options.redirectUri)}`
        : "";
      window.location.href = `${loginUrl}${redirect}`;
    },
    [loginUrl],
  );

  const logout = React.useCallback(async () => {
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      const data = await res.json();
      setUser(null);
      setToken(null);

      // Broadcast logout to other tabs
      try {
        broadcastRef.current?.postMessage({ type: "LOGOUT" });
      } catch {
        localStorage.setItem(
          "healthgate-session-sync",
          JSON.stringify({ type: "LOGOUT", timestamp: Date.now() }),
        );
      }

      if (data.redirectTo) {
        window.location.href = data.redirectTo;
      } else {
        window.location.href = loginUrl;
      }
    } catch {
      window.location.href = loginUrl;
    }
  }, [loginUrl]);

  const refresh = React.useCallback(async () => {
    try {
      const res = await fetch("/api/auth/refresh", { method: "POST" });
      if (!res.ok) {
        const err: HealthGateError = {
          code: "TOKEN_REFRESH_FAILED",
          message: "Failed to refresh session",
        };
        onAuthError?.(err);
        setUser(null);
        setToken(null);
        window.location.href = "/session-expired";
        return;
      }

      try {
        broadcastRef.current?.postMessage({
          type: "EXTEND",
          newExpiry: Date.now() + idleTimeoutMs,
        });
      } catch {
        localStorage.setItem(
          "healthgate-session-sync",
          JSON.stringify({ type: "EXTEND", timestamp: Date.now() }),
        );
      }

      await checkSession();
    } catch {
      const err: HealthGateError = {
        code: "NETWORK_ERROR",
        message: "Network error during token refresh",
      };
      onAuthError?.(err);
      window.location.href = "/session-expired";
    }
  }, [checkSession, idleTimeoutMs, onAuthError]);

  // --- Session timeout logic (integrated from use-session-timeout) ---

  // Debounced activity tracker
  const onActivity = React.useMemo(() => {
    let lastFired = 0;
    return () => {
      const now = Date.now();
      if (now - lastFired < debounceMs) return;
      lastFired = now;
      lastActivityRef.current = now;

      try {
        broadcastRef.current?.postMessage({ type: "ACTIVITY", timestamp: now });
      } catch {
        localStorage.setItem(
          "healthgate-session-sync",
          JSON.stringify({ type: "ACTIVITY", timestamp: now }),
        );
      }
    };
  }, []);

  // Activity listeners
  React.useEffect(() => {
    if (!isAuthenticated) return;

    const events = ["mousemove", "keydown", "touchstart", "scroll"] as const;
    for (const event of events) {
      window.addEventListener(event, onActivity, { passive: true });
    }
    return () => {
      for (const event of events) {
        window.removeEventListener(event, onActivity);
      }
    };
  }, [isAuthenticated, onActivity]);

  // BroadcastChannel setup
  React.useEffect(() => {
    if (!isAuthenticated) return;

    try {
      const bc = new BroadcastChannel("healthgate-session");
      broadcastRef.current = bc;

      bc.addEventListener("message", (event) => {
        switch (event.data.type) {
          case "ACTIVITY":
            lastActivityRef.current = event.data.timestamp;
            break;
          case "WARNING":
            setShowWarning(true);
            setRemainingMs(event.data.remainingMs);
            break;
          case "EXTEND":
            setShowWarning(false);
            lastActivityRef.current = Date.now();
            break;
          case "LOGOUT":
            setUser(null);
            setToken(null);
            window.location.href = loginUrl;
            break;
          case "SESSION_EXPIRED":
            setUser(null);
            setToken(null);
            onSessionExpired?.();
            window.location.href = "/session-expired";
            break;
        }
      });

      return () => {
        bc.close();
        broadcastRef.current = null;
      };
    } catch {
      const handleStorage = (e: StorageEvent) => {
        if (e.key !== "healthgate-session-sync" || !e.newValue) return;
        const data = JSON.parse(e.newValue);
        switch (data.type) {
          case "ACTIVITY":
            lastActivityRef.current = data.timestamp;
            break;
          case "EXTEND":
            setShowWarning(false);
            lastActivityRef.current = Date.now();
            break;
          case "LOGOUT":
            setUser(null);
            setToken(null);
            window.location.href = loginUrl;
            break;
          case "SESSION_EXPIRED":
            setUser(null);
            setToken(null);
            onSessionExpired?.();
            window.location.href = "/session-expired";
            break;
        }
      };
      window.addEventListener("storage", handleStorage);
      return () => window.removeEventListener("storage", handleStorage);
    }
  }, [isAuthenticated, loginUrl, onSessionExpired]);

  // Main check loop
  React.useEffect(() => {
    if (!isAuthenticated) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const idleElapsed = now - lastActivityRef.current;
      const effectiveIdleTimeout = idleTimeoutMs - clientAheadMs;
      const idleRemaining = effectiveIdleTimeout - idleElapsed;

      const sessionAge = now - sessionStartMs;
      const maxRemaining = maxLifetimeMs - sessionAge;

      const remaining = Math.min(idleRemaining, maxRemaining);

      if (remaining <= 0) {
        try {
          broadcastRef.current?.postMessage({ type: "SESSION_EXPIRED" });
        } catch {
          localStorage.setItem(
            "healthgate-session-sync",
            JSON.stringify({ type: "SESSION_EXPIRED", timestamp: now }),
          );
        }
        onSessionExpired?.();
        window.location.href = "/session-expired";
        return;
      }

      setRemainingMs(remaining);

      if (remaining <= warningLeadMs && !showWarning) {
        setShowWarning(true);
        try {
          broadcastRef.current?.postMessage({ type: "WARNING", remainingMs: remaining });
        } catch {
          // localStorage fallback handled by other tabs
        }
      }
    }, checkIntervalMs);

    return () => clearInterval(interval);
  }, [isAuthenticated, idleTimeoutMs, maxLifetimeMs, sessionStartMs, showWarning, warningLeadMs, onSessionExpired]);

  // Session actions
  const extendSession = React.useCallback(async () => {
    setShowWarning(false);
    lastActivityRef.current = Date.now();
    await refresh();
  }, [refresh]);

  const dismissAndLogout = React.useCallback(() => {
    setShowWarning(false);
    logout();
  }, [logout]);

  // --- Context value ---

  const session = React.useMemo(
    () => ({
      expiresAt,
      idleTimeRemaining: remainingMs,
      isSessionWarningVisible: showWarning,
      extendSession,
      dismissAndLogout,
    }),
    [expiresAt, remainingMs, showWarning, extendSession, dismissAndLogout],
  );

  const value: HealthGateContextValue = React.useMemo(
    () => ({
      user,
      isAuthenticated,
      isLoading,
      token,
      login,
      logout,
      refresh,
      roles,
      hasRole,
      session,
      config,
    }),
    [user, isAuthenticated, isLoading, token, login, logout, refresh, roles, hasRole, session, config],
  );

  return (
    <HealthGateContext.Provider value={value}>
      {children}
      {isAuthenticated && showWarning && (
        <SessionTimeoutWarning
          remainingMs={remainingMs}
          onExtend={extendSession}
          onLogout={dismissAndLogout}
        />
      )}
    </HealthGateContext.Provider>
  );
}

/** Access the HealthGate context. Must be used within a HealthGateProvider. */
export function useHealthGateContext(): HealthGateContextValue {
  const context = React.useContext(HealthGateContext);
  if (!context) {
    throw new Error("useHealthGateContext must be used within a <HealthGateProvider>");
  }
  return context;
}
