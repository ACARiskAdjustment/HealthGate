/**
 * Brute-force protection and account lockout tracking.
 *
 * Per Security Review §8 and Attack Tree 2:
 * - Per-account lockout: 5 consecutive failures → 15 min lock, progressive doubling
 * - Per-IP rate limiting: handled by rate-limit.ts
 * - Distributed attack detection: alert when global failure rate > 10% for 5 min
 *
 * In production, this is primarily handled by Keycloak's built-in brute force detection.
 * This module provides the BFF-side tracking and the Keycloak Admin API integration.
 */

import { getServerEnv } from "@/types/env";

/** Lockout progression: 15 min → 30 min → 60 min → permanent */
const LOCKOUT_DURATIONS_MS = [
  15 * 60 * 1000, // 15 min
  30 * 60 * 1000, // 30 min
  60 * 60 * 1000, // 60 min
  -1, // Permanent (requires admin unlock)
];

interface AccountLockoutEntry {
  /** Number of consecutive lockout periods */
  lockoutCount: number;
  /** Consecutive failed attempts in current period */
  failedAttempts: number;
  /** Timestamp when the lockout expires (0 = not locked, -1 = permanent) */
  lockedUntil: number;
  /** Last failure timestamp */
  lastFailureAt: number;
}

/** In-memory lockout store (production: Keycloak handles this) */
const lockoutStore = new Map<string, AccountLockoutEntry>();

/** Maximum failed attempts before lockout (FR12) */
const MAX_FAILURES = 5;

/** Window for counting failures (24 hours) */
const FAILURE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Check if an account is currently locked out.
 * Returns lockout status and remaining time.
 */
export function checkAccountLockout(email: string): {
  locked: boolean;
  remainingMs: number;
  permanent: boolean;
} {
  const key = email.toLowerCase();
  const entry = lockoutStore.get(key);

  if (!entry) {
    return { locked: false, remainingMs: 0, permanent: false };
  }

  // Permanent lockout
  if (entry.lockedUntil === -1) {
    return { locked: true, remainingMs: -1, permanent: true };
  }

  // Timed lockout
  if (entry.lockedUntil > 0) {
    const remaining = entry.lockedUntil - Date.now();
    if (remaining > 0) {
      return { locked: true, remainingMs: remaining, permanent: false };
    }
    // Lockout has expired — reset failed attempts but keep lockout count
    entry.failedAttempts = 0;
    entry.lockedUntil = 0;
  }

  return { locked: false, remainingMs: 0, permanent: false };
}

/**
 * Record a failed login attempt.
 * Returns the new lockout status.
 */
export function recordFailedAttempt(email: string): {
  locked: boolean;
  remainingMs: number;
  attemptsRemaining: number;
} {
  const key = email.toLowerCase();
  let entry = lockoutStore.get(key);

  if (!entry) {
    entry = {
      lockoutCount: 0,
      failedAttempts: 0,
      lockedUntil: 0,
      lastFailureAt: 0,
    };
    lockoutStore.set(key, entry);
  }

  // Reset failures if outside the failure window
  if (Date.now() - entry.lastFailureAt > FAILURE_WINDOW_MS) {
    entry.failedAttempts = 0;
  }

  entry.failedAttempts++;
  entry.lastFailureAt = Date.now();

  // Check if we've hit the lockout threshold
  if (entry.failedAttempts >= MAX_FAILURES) {
    const durationIndex = Math.min(entry.lockoutCount, LOCKOUT_DURATIONS_MS.length - 1);
    const durationMs = LOCKOUT_DURATIONS_MS[durationIndex];

    if (durationMs === -1) {
      entry.lockedUntil = -1; // Permanent
    } else {
      entry.lockedUntil = Date.now() + durationMs;
    }

    entry.lockoutCount++;
    entry.failedAttempts = 0;

    return {
      locked: true,
      remainingMs: durationMs,
      attemptsRemaining: 0,
    };
  }

  return {
    locked: false,
    remainingMs: 0,
    attemptsRemaining: MAX_FAILURES - entry.failedAttempts,
  };
}

/**
 * Record a successful login — resets the failure counter.
 */
export function recordSuccessfulLogin(email: string): void {
  const key = email.toLowerCase();
  lockoutStore.delete(key);
}

/**
 * Manually unlock an account (admin action).
 */
export function unlockAccount(email: string): void {
  const key = email.toLowerCase();
  lockoutStore.delete(key);
}

/**
 * Check account lockout status via Keycloak Admin REST API.
 * In production, this is the authoritative source; our in-memory store is a cache.
 */
export async function checkKeycloakBruteForceStatus(
  userId: string,
): Promise<{ disabled: boolean; numFailures: number; lastFailure: number } | null> {
  try {
    const env = getServerEnv();
    const url = `${env.KEYCLOAK_URL}/admin/realms/${env.KEYCLOAK_REALM}/attack-detection/brute-force/users/${userId}`;

    // In production: use a service account token for this Admin API call
    const res = await fetch(url, {
      headers: {
        // Placeholder: would use service account bearer token
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(3000),
    });

    if (!res.ok) return null;

    return res.json();
  } catch {
    return null;
  }
}

// --- Global failure rate tracking for distributed attack detection ---

interface GlobalRateEntry {
  successCount: number;
  failureCount: number;
  windowStart: number;
}

const GLOBAL_WINDOW_MS = 5 * 60 * 1000; // 5-minute window
const FAILURE_RATE_THRESHOLD = 0.10; // 10% failure rate triggers alert

let globalRate: GlobalRateEntry = {
  successCount: 0,
  failureCount: 0,
  windowStart: Date.now(),
};

function resetGlobalWindowIfExpired() {
  if (Date.now() - globalRate.windowStart > GLOBAL_WINDOW_MS) {
    globalRate = { successCount: 0, failureCount: 0, windowStart: Date.now() };
  }
}

/** Record a login attempt result for global rate monitoring */
export function recordGlobalAttempt(success: boolean): void {
  resetGlobalWindowIfExpired();
  if (success) {
    globalRate.successCount++;
  } else {
    globalRate.failureCount++;
  }
}

/**
 * Check if the global failure rate exceeds the anomaly threshold.
 * Returns true if an alert should be triggered.
 */
export function isGlobalFailureRateAnomaly(): boolean {
  resetGlobalWindowIfExpired();
  const total = globalRate.successCount + globalRate.failureCount;
  if (total < 10) return false; // Not enough data
  return globalRate.failureCount / total > FAILURE_RATE_THRESHOLD;
}
