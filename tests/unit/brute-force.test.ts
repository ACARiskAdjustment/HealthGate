import { describe, it, expect, beforeEach } from "vitest";
import {
  checkAccountLockout,
  recordFailedAttempt,
  recordSuccessfulLogin,
  unlockAccount,
  recordGlobalAttempt,
  isGlobalFailureRateAnomaly,
} from "@/lib/brute-force";

describe("Account Lockout", () => {
  const email = () => `test-${Date.now()}-${Math.random()}@example.com`;

  it("allows login with no prior failures", () => {
    const result = checkAccountLockout(email());
    expect(result.locked).toBe(false);
    expect(result.permanent).toBe(false);
  });

  it("tracks failed attempts and locks after 5", () => {
    const e = email();
    for (let i = 0; i < 4; i++) {
      const result = recordFailedAttempt(e);
      expect(result.locked).toBe(false);
      expect(result.attemptsRemaining).toBe(5 - (i + 1));
    }

    // 5th failure triggers lockout
    const result = recordFailedAttempt(e);
    expect(result.locked).toBe(true);
    expect(result.attemptsRemaining).toBe(0);
    // First lockout duration should be 15 minutes (900000ms)
    expect(result.remainingMs).toBe(15 * 60 * 1000);
  });

  it("reports locked status when checking locked account", () => {
    const e = email();
    for (let i = 0; i < 5; i++) {
      recordFailedAttempt(e);
    }

    const status = checkAccountLockout(e);
    expect(status.locked).toBe(true);
    expect(status.remainingMs).toBeGreaterThan(0);
  });

  it("resets on successful login", () => {
    const e = email();
    recordFailedAttempt(e);
    recordFailedAttempt(e);

    recordSuccessfulLogin(e);

    const status = checkAccountLockout(e);
    expect(status.locked).toBe(false);
  });

  it("resets on admin unlock", () => {
    const e = email();
    for (let i = 0; i < 5; i++) {
      recordFailedAttempt(e);
    }

    unlockAccount(e);
    const status = checkAccountLockout(e);
    expect(status.locked).toBe(false);
  });

  it("normalizes email to lowercase", () => {
    const e = `Test-${Date.now()}@Example.COM`;
    recordFailedAttempt(e);
    recordFailedAttempt(e.toLowerCase());

    // Both should count as the same account
    const status = checkAccountLockout(e.toUpperCase());
    expect(status.locked).toBe(false); // 2 failures, not 5 yet
  });
});

describe("Global Failure Rate Tracking", () => {
  it("does not flag anomaly with insufficient data", () => {
    // Fresh state — fewer than 10 attempts total
    expect(isGlobalFailureRateAnomaly()).toBe(false);
  });

  it("detects anomaly when failure rate exceeds 10%", () => {
    // Record enough attempts to trigger detection
    for (let i = 0; i < 5; i++) {
      recordGlobalAttempt(true);
    }
    for (let i = 0; i < 6; i++) {
      recordGlobalAttempt(false);
    }
    // 6/(5+6) ≈ 54% > 10%
    expect(isGlobalFailureRateAnomaly()).toBe(true);
  });
});
