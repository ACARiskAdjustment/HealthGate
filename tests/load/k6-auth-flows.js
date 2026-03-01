/**
 * k6 Load Test — HealthGate Auth Flows
 *
 * Scenarios per NFR11:
 *   baseline:  100 concurrent users, 10 min sustained  → p95 < 2s, 0 errors
 *   peak:      1,000 concurrent users, 5 min sustained → p95 < 3s, err < 0.1%
 *   stress:    ramp to 5,000 users over 10 min         → graceful degrade, err < 1%
 *   soak:      500 concurrent users, 4 hr sustained    → no leaks, p95 stable
 *   failover:  500 users + kill primary mid-run         → recovery < 15s
 *
 * Usage:
 *   k6 run --env SCENARIO=baseline tests/load/k6-auth-flows.js
 *   k6 run --env SCENARIO=peak tests/load/k6-auth-flows.js
 */

import http from "k6/http";
import { check, sleep, group } from "k6";
import { Rate, Trend } from "k6/metrics";

// ─── Custom metrics ──────────────────────────────────────────────────────────

const loginDuration = new Trend("healthgate_login_duration", true);
const refreshDuration = new Trend("healthgate_refresh_duration", true);
const sessionCheckDuration = new Trend("healthgate_session_check_duration", true);
const loginErrorRate = new Rate("healthgate_login_error_rate");

// ─── Config ──────────────────────────────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const SCENARIO = __ENV.SCENARIO || "baseline";

const SCENARIOS = {
  baseline: {
    executor: "constant-vus",
    vus: 100,
    duration: "10m",
  },
  peak: {
    executor: "constant-vus",
    vus: 1000,
    duration: "5m",
  },
  stress: {
    executor: "ramping-vus",
    startVUs: 0,
    stages: [
      { duration: "2m", target: 1000 },
      { duration: "3m", target: 3000 },
      { duration: "3m", target: 5000 },
      { duration: "2m", target: 0 },
    ],
  },
  soak: {
    executor: "constant-vus",
    vus: 500,
    duration: "4h",
  },
  failover: {
    executor: "constant-vus",
    vus: 500,
    duration: "10m",
  },
};

export const options = {
  scenarios: {
    auth_flow: SCENARIOS[SCENARIO] || SCENARIOS.baseline,
  },
  thresholds: {
    // SLO: login p95 < 2s (baseline) or < 3s (peak)
    healthgate_login_duration: SCENARIO === "peak"
      ? ["p(95)<3000"]
      : ["p(95)<2000"],
    // SLO: token refresh p95 < 200ms
    healthgate_refresh_duration: ["p(95)<200"],
    // Error rate thresholds per scenario
    healthgate_login_error_rate: SCENARIO === "stress"
      ? ["rate<0.01"]       // < 1% for stress
      : SCENARIO === "peak"
        ? ["rate<0.001"]    // < 0.1% for peak
        : ["rate<0.0001"],  // ~0 for baseline
  },
};

// ─── Test data ───────────────────────────────────────────────────────────────

function getTestUser() {
  const idx = (__VU % 100) + 1;
  return {
    email: `loadtest-user-${idx}@healthgate-test.local`,
    password: `LoadTest!Pwd${idx}#2024`,
  };
}

// ─── Scenarios ───────────────────────────────────────────────────────────────

export default function () {
  const user = getTestUser();

  group("Full Auth Flow", () => {
    // 1. Login
    group("Login", () => {
      const loginPayload = JSON.stringify({
        email: user.email,
        password: user.password,
      });

      const loginRes = http.post(`${BASE_URL}/api/auth/login`, loginPayload, {
        headers: { "Content-Type": "application/json" },
        tags: { name: "POST /api/auth/login" },
      });

      loginDuration.add(loginRes.timings.duration);
      loginErrorRate.add(loginRes.status !== 200);

      check(loginRes, {
        "login status 200": (r) => r.status === 200,
        "login has body": (r) => r.body.length > 0,
        "login not rate-limited": (r) => r.status !== 429,
      });

      if (loginRes.status === 429) {
        // Back off if rate-limited
        const retryAfter = parseInt(loginRes.headers["Retry-After"] || "5", 10);
        sleep(retryAfter);
        return;
      }
    });

    sleep(1);

    // 2. Session check
    group("Session Check", () => {
      const sessionRes = http.get(`${BASE_URL}/api/auth/session`, {
        tags: { name: "GET /api/auth/session" },
      });

      sessionCheckDuration.add(sessionRes.timings.duration);

      check(sessionRes, {
        "session status 200": (r) => r.status === 200,
        "session has user": (r) => {
          try {
            const body = JSON.parse(r.body);
            return body.authenticated === true;
          } catch {
            return false;
          }
        },
      });
    });

    sleep(1);

    // 3. Token refresh
    group("Token Refresh", () => {
      const refreshRes = http.post(`${BASE_URL}/api/auth/refresh`, null, {
        tags: { name: "POST /api/auth/refresh" },
      });

      refreshDuration.add(refreshRes.timings.duration);

      check(refreshRes, {
        "refresh status 200": (r) => r.status === 200,
      });
    });

    sleep(1);

    // 4. CSRF token fetch
    group("CSRF Token", () => {
      const csrfRes = http.get(`${BASE_URL}/api/auth/csrf`, {
        tags: { name: "GET /api/auth/csrf" },
      });

      check(csrfRes, {
        "csrf status 200": (r) => r.status === 200,
      });
    });

    sleep(1);

    // 5. Logout
    group("Logout", () => {
      const logoutRes = http.post(`${BASE_URL}/api/auth/logout`, null, {
        tags: { name: "POST /api/auth/logout" },
      });

      check(logoutRes, {
        "logout status 200": (r) => r.status === 200,
      });
    });
  });

  // Think time between iterations
  sleep(Math.random() * 3 + 1);
}

// ─── Lifecycle hooks ─────────────────────────────────────────────────────────

export function setup() {
  // Verify the service is reachable
  const healthRes = http.get(`${BASE_URL}/api/healthz`);
  check(healthRes, {
    "service is healthy": (r) => r.status === 200,
  });

  console.log(`Running scenario: ${SCENARIO}`);
  console.log(`Base URL: ${BASE_URL}`);

  return { scenario: SCENARIO, startTime: new Date().toISOString() };
}

export function teardown(data) {
  console.log(`Scenario ${data.scenario} completed.`);
  console.log(`Started at: ${data.startTime}`);
  console.log(`Ended at: ${new Date().toISOString()}`);
}
