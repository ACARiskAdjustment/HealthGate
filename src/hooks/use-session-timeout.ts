"use client";

import * as React from "react";

/**
 * Client-side session timeout enforcement.
 *
 * Per Architecture Doc §7.3:
 * - Tracks user activity (mousemove, keydown, touchstart, scroll)
 * - Shows warning 2 minutes before timeout
 * - Check loop runs every 10 seconds
 * - BroadcastChannel cross-tab sync for ACTIVITY/WARNING/EXTEND/LOGOUT/SESSION_EXPIRED
 * - Client-side timer runs 5 seconds ahead of server to prevent race condition (EC5)
 * - localStorage fallback for browsers without BroadcastChannel
 */

const ACTIVITY_EVENTS = ["mousemove", "keydown", "touchstart", "scroll"] as const;
const WARNING_LEAD_MS = 2 * 60 * 1000; // 2 minutes before timeout
const CHECK_INTERVAL_MS = 10 * 1000; // Check every 10 seconds
const DEBOUNCE_MS = 1000; // Activity tracker fires max once per second
const CLIENT_AHEAD_MS = 5000; // Client timer runs 5s ahead of server
const CHANNEL_NAME = "healthgate-session";
const STORAGE_KEY = "healthgate-session-sync";

interface UseSessionTimeoutOptions {
  /** Idle timeout in ms (default: 15 min from realm config) */
  idleTimeoutMs?: number;
  /** Max session lifetime in ms (default: 12 hr clinician) */
  maxLifetimeMs?: number;
  /** Session start timestamp in ms */
  sessionStartMs?: number;
  /** Whether the user is authenticated */
  enabled?: boolean;
  /** Callback when session should be extended */
  onExtend: () => Promise<void>;
  /** Callback when user should be logged out */
  onLogout: () => void;
  /** Callback when session has expired */
  onExpired: () => void;
}

interface UseSessionTimeoutReturn {
  /** Whether the warning dialog should be shown */
  showWarning: boolean;
  /** Remaining ms until session expires (for warning countdown) */
  remainingMs: number;
  /** Dismiss warning and extend session */
  extendSession: () => void;
  /** Dismiss warning and log out */
  dismissAndLogout: () => void;
}

export function useSessionTimeout(options: UseSessionTimeoutOptions): UseSessionTimeoutReturn {
  const {
    idleTimeoutMs = 15 * 60 * 1000,
    maxLifetimeMs = 12 * 60 * 60 * 1000,
    sessionStartMs = Date.now(),
    enabled = true,
    onExtend,
    onLogout,
    onExpired,
  } = options;

  const [showWarning, setShowWarning] = React.useState(false);
  const [remainingMs, setRemainingMs] = React.useState(idleTimeoutMs);
  const lastActivityRef = React.useRef(Date.now());
  const broadcastRef = React.useRef<BroadcastChannel | null>(null);

  // Debounced activity tracker
  const onActivity = React.useMemo(() => {
    let lastFired = 0;
    return () => {
      const now = Date.now();
      if (now - lastFired < DEBOUNCE_MS) return;
      lastFired = now;
      lastActivityRef.current = now;

      // Broadcast activity to other tabs
      try {
        broadcastRef.current?.postMessage({ type: "ACTIVITY", timestamp: now });
      } catch {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ type: "ACTIVITY", timestamp: now }));
      }
    };
  }, []);

  // Set up activity listeners
  React.useEffect(() => {
    if (!enabled) return;

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, onActivity, { passive: true });
    }
    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, onActivity);
      }
    };
  }, [enabled, onActivity]);

  // Set up BroadcastChannel (or localStorage fallback)
  React.useEffect(() => {
    if (!enabled) return;

    try {
      const bc = new BroadcastChannel(CHANNEL_NAME);
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
            onLogout();
            break;
          case "SESSION_EXPIRED":
            onExpired();
            break;
        }
      });

      return () => {
        bc.close();
        broadcastRef.current = null;
      };
    } catch {
      // Fallback: localStorage event listener
      const handleStorage = (e: StorageEvent) => {
        if (e.key !== STORAGE_KEY || !e.newValue) return;
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
            onLogout();
            break;
          case "SESSION_EXPIRED":
            onExpired();
            break;
        }
      };
      window.addEventListener("storage", handleStorage);
      return () => window.removeEventListener("storage", handleStorage);
    }
  }, [enabled, onLogout, onExpired]);

  // Main check loop (every 10 seconds)
  React.useEffect(() => {
    if (!enabled) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const idleElapsed = now - lastActivityRef.current;
      const effectiveIdleTimeout = idleTimeoutMs - CLIENT_AHEAD_MS;
      const idleRemaining = effectiveIdleTimeout - idleElapsed;

      // Max session lifetime check
      const sessionAge = now - sessionStartMs;
      const maxRemaining = maxLifetimeMs - sessionAge;

      const remaining = Math.min(idleRemaining, maxRemaining);

      if (remaining <= 0) {
        // Session expired
        try {
          broadcastRef.current?.postMessage({ type: "SESSION_EXPIRED" });
        } catch {
          localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ type: "SESSION_EXPIRED", timestamp: now }),
          );
        }
        onExpired();
        return;
      }

      setRemainingMs(remaining);

      if (remaining <= WARNING_LEAD_MS && !showWarning) {
        setShowWarning(true);
        try {
          broadcastRef.current?.postMessage({ type: "WARNING", remainingMs: remaining });
        } catch {
          // localStorage fallback handled by other tabs
        }
      }
    }, CHECK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [enabled, idleTimeoutMs, maxLifetimeMs, sessionStartMs, showWarning, onExpired]);

  const extendSession = React.useCallback(async () => {
    setShowWarning(false);
    lastActivityRef.current = Date.now();

    try {
      await onExtend();
      broadcastRef.current?.postMessage({ type: "EXTEND", newExpiry: Date.now() + idleTimeoutMs });
    } catch {
      onExpired();
    }
  }, [onExtend, onExpired, idleTimeoutMs]);

  const dismissAndLogout = React.useCallback(() => {
    setShowWarning(false);
    try {
      broadcastRef.current?.postMessage({ type: "LOGOUT" });
    } catch {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ type: "LOGOUT", timestamp: Date.now() }));
    }
    onLogout();
  }, [onLogout]);

  return { showWarning, remainingMs, extendSession, dismissAndLogout };
}
