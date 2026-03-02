import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/cookies";
import { RATE_LIMITS, applyRateLimit } from "@/lib/rate-limit";
import type { SessionStatusResponse, HealthGateUser } from "@/types/auth";

/**
 * GET /api/auth/session — Return current session status.
 * Rate limited: 200/min per IP.
 */
export async function GET(request: NextRequest) {
  const rateLimited = applyRateLimit(request, "SESSION", RATE_LIMITS.SESSION);
  if (rateLimited) return rateLimited;

  try {
    const accessToken = getAccessToken();

    if (!accessToken) {
      const response: SessionStatusResponse = {
        authenticated: false,
        user: null,
        expiresAt: null,
        idleTimeoutMs: null,
        maxLifetimeMs: null,
        sessionStartedAt: null,
      };
      return NextResponse.json(response);
    }

    const payload = JSON.parse(
      Buffer.from(accessToken.split(".")[1], "base64").toString("utf8"),
    );

    // Server-side token expiry check
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      const response: SessionStatusResponse = {
        authenticated: false,
        user: null,
        expiresAt: null,
        idleTimeoutMs: null,
        maxLifetimeMs: null,
        sessionStartedAt: null,
      };
      return NextResponse.json(response);
    }

    const user: HealthGateUser = {
      sub: payload.sub,
      email: payload.email,
      emailVerified: payload.email_verified,
      name: payload.name,
      givenName: payload.given_name,
      familyName: payload.family_name,
      preferredUsername: payload.preferred_username,
      realmRoles: payload.realm_access?.roles || [],
      clientRoles: payload.resource_access
        ? Object.fromEntries(
            Object.entries(payload.resource_access).map(([key, val]: [string, any]) => [
              key,
              val.roles || [],
            ]),
          )
        : {},
    };

    const response: SessionStatusResponse = {
      authenticated: true,
      user,
      expiresAt: payload.exp ? new Date(payload.exp * 1000).toISOString() : null,
      idleTimeoutMs: 900 * 1000,
      maxLifetimeMs: 43200 * 1000,
      sessionStartedAt: payload.auth_time ? new Date(payload.auth_time * 1000).toISOString() : null,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("[auth/session] Error:", error);
    return NextResponse.json({
      authenticated: false,
      user: null,
      expiresAt: null,
      idleTimeoutMs: null,
      maxLifetimeMs: null,
      sessionStartedAt: null,
    } satisfies SessionStatusResponse);
  }
}
