import { describe, it, expect } from "vitest";
import {
  requestDuration,
  csrfValidationFailures,
  observeHistogram,
  incrementCounter,
  getMetricsText,
} from "@/lib/metrics";

describe("Prometheus Metrics", () => {
  it("observes histogram values and exports Prometheus text", () => {
    observeHistogram(requestDuration, { route: "/api/auth/login", method: "POST", status_code: "200" }, 0.15);
    observeHistogram(requestDuration, { route: "/api/auth/login", method: "POST", status_code: "200" }, 0.25);

    const text = getMetricsText();
    expect(text).toContain("healthgate_bff_request_duration_seconds");
    expect(text).toContain("# TYPE healthgate_bff_request_duration_seconds histogram");
    expect(text).toContain("_count");
    expect(text).toContain("_sum");
    expect(text).toContain("_bucket");
  });

  it("increments counter values", () => {
    incrementCounter(csrfValidationFailures, { route: "/api/auth/login" });
    incrementCounter(csrfValidationFailures, { route: "/api/auth/login" });

    const text = getMetricsText();
    expect(text).toContain("healthgate_bff_csrf_validation_failures_total");
    expect(text).toContain("# TYPE healthgate_bff_csrf_validation_failures_total counter");
  });

  it("tracks separate label combinations independently", () => {
    observeHistogram(requestDuration, { route: "/api/auth/session", method: "GET", status_code: "200" }, 0.05);
    observeHistogram(requestDuration, { route: "/api/auth/session", method: "GET", status_code: "503" }, 1.5);

    const text = getMetricsText();
    expect(text).toContain("status_code=\"200\"");
    expect(text).toContain("status_code=\"503\"");
  });

  it("produces valid Prometheus exposition format", () => {
    const text = getMetricsText();
    // Every non-empty line should be a comment (#) or a metric line
    const lines = text.split("\n").filter((l) => l.length > 0);
    for (const line of lines) {
      expect(line.startsWith("#") || /^[a-z_]+/.test(line)).toBe(true);
    }
  });
});
