/**
 * BFF Prometheus-compatible metrics instrumentation.
 *
 * Exposes custom counters and histograms for:
 * - Request duration by route/method/status
 * - Token refresh duration
 * - CSRF validation failures
 * - Cookie encryption errors
 *
 * In production, these are scraped by Prometheus via GET /api/metrics.
 * In-memory implementation; for multi-replica deployments use a push gateway
 * or metrics aggregation sidecar.
 */

interface HistogramBucket {
  le: number;
  count: number;
}

interface Histogram {
  name: string;
  help: string;
  labels: string[];
  buckets: number[];
  observations: Map<string, { buckets: HistogramBucket[]; sum: number; count: number }>;
}

interface Counter {
  name: string;
  help: string;
  labels: string[];
  values: Map<string, number>;
}

// Default histogram buckets (in seconds)
const DEFAULT_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

// ─── Registry ────────────────────────────────────────────────────────────────

const histograms: Histogram[] = [];
const counters: Counter[] = [];

function createHistogram(name: string, help: string, labels: string[], buckets = DEFAULT_BUCKETS): Histogram {
  const h: Histogram = { name, help, labels, buckets, observations: new Map() };
  histograms.push(h);
  return h;
}

function createCounter(name: string, help: string, labels: string[]): Counter {
  const c: Counter = { name, help, labels, values: new Map() };
  counters.push(c);
  return c;
}

function labelKey(labelValues: Record<string, string>): string {
  return Object.entries(labelValues)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${v}"`)
    .join(",");
}

// ─── Metric Definitions ─────────────────────────────────────────────────────

export const requestDuration = createHistogram(
  "healthgate_bff_request_duration_seconds",
  "BFF request duration in seconds",
  ["route", "method", "status_code"],
);

export const tokenRefreshDuration = createHistogram(
  "healthgate_bff_token_refresh_duration_seconds",
  "Token refresh duration in seconds",
  ["realm", "result"],
);

export const csrfValidationFailures = createCounter(
  "healthgate_bff_csrf_validation_failures_total",
  "CSRF validation failure count",
  ["route"],
);

export const cookieEncryptionErrors = createCounter(
  "healthgate_bff_cookie_encryption_errors_total",
  "Cookie encryption/decryption error count",
  ["operation"],
);

export const rateLimitHits = createCounter(
  "healthgate_bff_rate_limit_hits_total",
  "Rate limit 429 response count",
  ["endpoint"],
);

// ─── Observation Functions ───────────────────────────────────────────────────

export function observeHistogram(histogram: Histogram, labels: Record<string, string>, value: number): void {
  const key = labelKey(labels);
  let obs = histogram.observations.get(key);
  if (!obs) {
    obs = {
      buckets: histogram.buckets.map((le) => ({ le, count: 0 })),
      sum: 0,
      count: 0,
    };
    histogram.observations.set(key, obs);
  }

  obs.sum += value;
  obs.count += 1;
  for (const bucket of obs.buckets) {
    if (value <= bucket.le) {
      bucket.count += 1;
    }
  }
}

export function incrementCounter(counter: Counter, labels: Record<string, string>, amount = 1): void {
  const key = labelKey(labels);
  counter.values.set(key, (counter.values.get(key) || 0) + amount);
}

// ─── Prometheus Text Format Export ───────────────────────────────────────────

export function getMetricsText(): string {
  const lines: string[] = [];

  for (const h of histograms) {
    lines.push(`# HELP ${h.name} ${h.help}`);
    lines.push(`# TYPE ${h.name} histogram`);
    h.observations.forEach((obs, key) => {
      const labelStr = key ? `{${key}}` : "";
      for (const bucket of obs.buckets) {
        lines.push(`${h.name}_bucket{${key}${key ? "," : ""}le="${bucket.le}"} ${bucket.count}`);
      }
      lines.push(`${h.name}_bucket{${key}${key ? "," : ""}le="+Inf"} ${obs.count}`);
      lines.push(`${h.name}_sum${labelStr} ${obs.sum}`);
      lines.push(`${h.name}_count${labelStr} ${obs.count}`);
    });
  }

  for (const c of counters) {
    lines.push(`# HELP ${c.name} ${c.help}`);
    lines.push(`# TYPE ${c.name} counter`);
    c.values.forEach((value, key) => {
      const labelStr = key ? `{${key}}` : "";
      lines.push(`${c.name}${labelStr} ${value}`);
    });
  }

  return lines.join("\n") + "\n";
}
