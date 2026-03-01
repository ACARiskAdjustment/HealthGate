import { NextRequest, NextResponse } from "next/server";
import { resetPasswordSchema } from "@/lib/validations";
import { RATE_LIMITS } from "@/lib/rate-limit";
import { apiGuard } from "@/lib/api-guard";
import { auditLogFromRequest } from "@/lib/audit";

/**
 * POST /api/auth/reset-password — Complete password reset with token.
 * Rate limited: 10 per 5 min per IP.
 */
export async function POST(request: NextRequest) {
  const guard = await apiGuard(request, {
    rateLimit: { name: "RESET_PASSWORD", config: RATE_LIMITS.RESET_PASSWORD },
    validateOrigin: true,
  });
  if (guard.error) return guard.error;

  const body = guard.body as Record<string, unknown>;
  const { token, ...passwordData } = body;

  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "Invalid or missing reset token" }, { status: 400 });
  }

  const parsed = resetPasswordSchema.safeParse(passwordData);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid password", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  try {
    // In production: validate the reset token and update password via Keycloak Admin API
    console.log("[auth/reset-password] Password reset with token:", token.substring(0, 8) + "...");

    auditLogFromRequest(request, {
      event_type: "PASSWORD_RESET_COMPLETE",
      result: "SUCCESS",
      auth_method: "reset_token",
    });

    return NextResponse.json({ message: "Password has been reset successfully" });
  } catch (error) {
    console.error("[auth/reset-password] Error:", error);

    auditLogFromRequest(request, {
      event_type: "PASSWORD_RESET_ERROR",
      result: "ERROR",
      auth_method: "reset_token",
      metadata: { reason: "internal_error" },
    });

    return NextResponse.json({ error: "Failed to reset password" }, { status: 500 });
  }
}
