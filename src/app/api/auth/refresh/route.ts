import { NextRequest, NextResponse } from "next/server";
import { refreshAccessToken } from "@/lib/keycloak";
import {
  getRefreshToken,
  setAccessTokenCookie,
  setRefreshTokenCookie,
  setSessionMetaCookie,
} from "@/lib/cookies";
import { RATE_LIMITS, applyRateLimit } from "@/lib/rate-limit";
import { auditLogFromRequest } from "@/lib/audit";

/**
 * POST /api/auth/refresh — Silent token refresh.
 * Rate limited: 100/min per IP, 1 per 60s per session (prevents race conditions).
 */
export async function POST(request: NextRequest) {
  // Rate limit check
  const rateLimited = applyRateLimit(request, "REFRESH", RATE_LIMITS.REFRESH);
  if (rateLimited) {
    auditLogFromRequest(request, {
      event_type: "RATE_LIMIT_EXCEEDED",
      result: "DENIED",
      metadata: { endpoint: "/api/auth/refresh" },
    });
    return rateLimited;
  }

  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    return NextResponse.json({ error: "No refresh token" }, { status: 401 });
  }

  try {
    const tokens = await refreshAccessToken(refreshToken);

    setAccessTokenCookie(tokens.access_token);
    setRefreshTokenCookie(tokens.refresh_token, tokens.refresh_expires_in);

    const now = Date.now();
    setSessionMetaCookie({ idleStartMs: now, maxStartMs: now });

    const expiresAt = new Date(now + tokens.expires_in * 1000).toISOString();

    let userId: string | null = null;
    try {
      const payload = JSON.parse(
        Buffer.from(tokens.access_token.split(".")[1], "base64").toString("utf8"),
      );
      userId = payload.sub;
    } catch {
      // Non-critical
    }

    auditLogFromRequest(request, {
      event_type: "TOKEN_REFRESH",
      result: "SUCCESS",
      user_id: userId,
      auth_method: "refresh_token",
      session_id: tokens.session_state,
    });

    return NextResponse.json({
      expiresAt,
      idleTimeoutMs: 900 * 1000,
      maxLifetimeMs: 43200 * 1000,
    });
  } catch (error) {
    console.error("[auth/refresh] Error:", error);

    auditLogFromRequest(request, {
      event_type: "TOKEN_REFRESH_ERROR",
      result: "FAILURE",
      auth_method: "refresh_token",
      metadata: {
        reason: error instanceof Error ? error.message : "unknown",
      },
    });

    return NextResponse.json({ error: "Token refresh failed" }, { status: 401 });
  }
}
