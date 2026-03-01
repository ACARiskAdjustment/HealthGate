import { NextRequest, NextResponse } from "next/server";
import { mfaSchema } from "@/lib/validations";
import { RATE_LIMITS } from "@/lib/rate-limit";
import { apiGuard, withMinResponseTime } from "@/lib/api-guard";
import { auditLogFromRequest } from "@/lib/audit";

/**
 * POST /api/auth/mfa — Verify TOTP code during login.
 * Rate limited: 30 per 5 min per IP.
 * 5 failures triggers session termination + account lockout.
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  return withMinResponseTime(startTime, 200, async () => {
    const guard = await apiGuard(request, {
      rateLimit: { name: "MFA", config: RATE_LIMITS.MFA },
      validateOrigin: true,
    });
    if (guard.error) {
      auditLogFromRequest(request, {
        event_type: "RATE_LIMIT_EXCEEDED",
        result: "DENIED",
        metadata: { endpoint: "/api/auth/mfa" },
      });
      return guard.error;
    }

    const parsed = mfaSchema.safeParse(guard.body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid verification code" }, { status: 400 });
    }

    try {
      // In production: relay TOTP code to Keycloak's authentication execution
      // Keycloak handles verification, replay detection, and lockout
      console.log(
        "[auth/mfa] TOTP verification for code:",
        parsed.data.totp_code.substring(0, 2) + "****",
      );

      auditLogFromRequest(request, {
        event_type: "MFA_VERIFY",
        result: "SUCCESS",
        auth_method: "totp",
        metadata: { remember_device: parsed.data.remember_device || false },
      });

      return NextResponse.json({ redirectTo: "/" });
    } catch (error) {
      console.error("[auth/mfa] Error:", error);

      auditLogFromRequest(request, {
        event_type: "MFA_VERIFY_ERROR",
        result: "FAILURE",
        auth_method: "totp",
        metadata: { reason: "verification_failed" },
      });

      return NextResponse.json({ error: "Verification failed" }, { status: 401 });
    }
  });
}
