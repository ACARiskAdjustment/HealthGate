import { NextRequest, NextResponse } from "next/server";
import { getServerEnv } from "@/types/env";
import { forgotPasswordSchema } from "@/lib/validations";
import { RATE_LIMITS } from "@/lib/rate-limit";
import { apiGuard, withMinResponseTime } from "@/lib/api-guard";
import { auditLogFromRequest } from "@/lib/audit";

/**
 * POST /api/auth/forgot-password
 * Always returns 200 regardless of account existence (prevents enumeration).
 * Rate limited: 10 per 5 min per IP.
 * 200ms minimum response time.
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const successMessage = "If an account exists, a reset link has been sent.";

  return withMinResponseTime(startTime, 200, async () => {
    const guard = await apiGuard(request, {
      rateLimit: { name: "FORGOT_PASSWORD", config: RATE_LIMITS.FORGOT_PASSWORD },
      validateOrigin: true,
    });

    // On rate limit: still return 200 (no enumeration signal)
    if (guard.error) {
      auditLogFromRequest(request, {
        event_type: "RATE_LIMIT_EXCEEDED",
        result: "DENIED",
        metadata: { endpoint: "/api/auth/forgot-password" },
      });
      return NextResponse.json({ message: successMessage });
    }

    const parsed = forgotPasswordSchema.safeParse(guard.body);
    if (!parsed.success) {
      return NextResponse.json({ message: successMessage });
    }

    try {
      const env = getServerEnv();
      // In production: trigger Keycloak's password reset email via Admin REST API
      console.log(`[auth/forgot-password] Reset requested for: ${parsed.data.email}`);

      auditLogFromRequest(request, {
        event_type: "PASSWORD_RESET_REQUEST",
        result: "SUCCESS",
        auth_method: "email",
        metadata: { email: parsed.data.email },
      });
    } catch {
      // Silently handle — no enumeration signal
    }

    return NextResponse.json({ message: successMessage });
  });
}
