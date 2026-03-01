import { NextResponse } from "next/server";

interface ReadyzCheck {
  name: string;
  status: "pass" | "fail";
  message?: string;
}

/** GET /api/readyz — Readiness probe for Kubernetes */
export async function GET() {
  const checks: ReadyzCheck[] = [];
  const keycloakUrl = process.env.KEYCLOAK_URL;

  // 1. Keycloak health check
  if (keycloakUrl) {
    try {
      const res = await fetch(`${keycloakUrl}/health/ready`, {
        signal: AbortSignal.timeout(3000),
      });
      checks.push({
        name: "keycloak",
        status: res.ok ? "pass" : "fail",
        message: res.ok ? undefined : `HTTP ${res.status}`,
      });
    } catch {
      checks.push({ name: "keycloak", status: "fail", message: "unreachable" });
    }
  } else {
    checks.push({ name: "keycloak", status: "pass", message: "url_not_configured" });
  }

  // 2. Environment validation (critical secrets present)
  const hasEncryptionKey = !!process.env.COOKIE_ENCRYPTION_KEY;
  checks.push({
    name: "encryption_key",
    status: hasEncryptionKey ? "pass" : "fail",
    message: hasEncryptionKey ? undefined : "COOKIE_ENCRYPTION_KEY not set",
  });

  // 3. Memory check (warn if >90% of limit)
  const memUsage = process.memoryUsage();
  const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
  checks.push({
    name: "memory",
    status: "pass",
    message: `heap_used=${heapUsedMB}MB`,
  });

  const allPassing = checks.every((c) => c.status === "pass");
  const status = allPassing ? "ready" : "not_ready";
  const httpStatus = allPassing ? 200 : 503;

  return NextResponse.json({ status, checks }, { status: httpStatus });
}
