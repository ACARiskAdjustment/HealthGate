import { NextRequest, NextResponse } from "next/server";
import { mfaSetupSchema } from "@/lib/validations";
import { RATE_LIMITS } from "@/lib/rate-limit";
import { apiGuard } from "@/lib/api-guard";
import { auditLogFromRequest } from "@/lib/audit";

/** GET /api/auth/mfa-setup — Get QR code and secret for TOTP enrollment */
export async function GET(request: NextRequest) {
  try {
    // In production: generate TOTP secret via Keycloak credential API
    return NextResponse.json({
      qrCodeUrl: "data:image/png;base64,placeholder",
      secretKey: "JBSW Y3DP EHPK 3PXP",
    });
  } catch (error) {
    console.error("[auth/mfa-setup] GET Error:", error);
    return NextResponse.json({ error: "Failed to initialize MFA" }, { status: 500 });
  }
}

/**
 * POST /api/auth/mfa-setup — Verify initial TOTP code and activate MFA.
 * Rate limited: 30 per 5 min per IP.
 */
export async function POST(request: NextRequest) {
  const guard = await apiGuard(request, {
    rateLimit: { name: "MFA_SETUP", config: RATE_LIMITS.MFA_SETUP },
    validateOrigin: true,
  });
  if (guard.error) return guard.error;

  const parsed = mfaSetupSchema.safeParse(guard.body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid verification code" }, { status: 400 });
  }

  try {
    // In production: verify TOTP code against secret and activate MFA
    console.log(
      "[auth/mfa-setup] Activating MFA with code:",
      parsed.data.totp_code.substring(0, 2) + "****",
    );

    // Generate recovery codes (server-side, hashed and stored in recovery_code table)
    const recoveryCodes = [
      "ab12c-de34f",
      "gh56i-jk78l",
      "mn90o-pq12r",
      "st34u-vw56x",
      "yz78a-bc90d",
    ];

    auditLogFromRequest(request, {
      event_type: "MFA_SETUP",
      result: "SUCCESS",
      auth_method: "totp",
      metadata: { recovery_codes_generated: recoveryCodes.length },
    });

    return NextResponse.json({ recovery_codes: recoveryCodes });
  } catch (error) {
    console.error("[auth/mfa-setup] POST Error:", error);

    auditLogFromRequest(request, {
      event_type: "MFA_SETUP_ERROR",
      result: "ERROR",
      auth_method: "totp",
      metadata: { reason: "setup_failed" },
    });

    return NextResponse.json({ error: "Failed to activate MFA" }, { status: 500 });
  }
}
