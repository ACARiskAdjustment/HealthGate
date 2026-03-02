import { NextRequest, NextResponse } from "next/server";
import { getServerEnv } from "@/types/env";
import { buildAuthorizationUrl, getKeycloakUrls } from "@/lib/keycloak";
import { generateCodeVerifier, generateCodeChallenge, generateRandomHex } from "@/lib/crypto";
import {
  setAccessTokenCookie,
  setRefreshTokenCookie,
  setPkceVerifierCookie,
  setSessionMetaCookie,
} from "@/lib/cookies";
import { loginSchema } from "@/lib/validations";
import { RATE_LIMITS } from "@/lib/rate-limit";
import { apiGuard, withMinResponseTime } from "@/lib/api-guard";
import { auditLogFromRequest } from "@/lib/audit";
import {
  checkAccountLockout,
  recordFailedAttempt,
  recordSuccessfulLogin,
  recordGlobalAttempt,
  isGlobalFailureRateAnomaly,
} from "@/lib/brute-force";

/**
 * POST /api/auth/login — BFF-mediated login via Keycloak ROPC grant.
 *
 * Security hardening (M2):
 * - Rate limited: 20 failed attempts per 5 min per IP
 * - 200ms minimum response time (timing attack prevention)
 * - Audit logging for all outcomes
 * - Origin/Referer validation
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  return withMinResponseTime(startTime, 200, async () => {
    // Guard: rate limit + origin validation + body parsing
    const guard = await apiGuard(request, {
      rateLimit: { name: "LOGIN", config: RATE_LIMITS.LOGIN },
      validateOrigin: true,
    });
    if (guard.error) {
      auditLogFromRequest(request, {
        event_type: "RATE_LIMIT_EXCEEDED",
        result: "DENIED",
        auth_method: "password",
        metadata: { endpoint: "/api/auth/login" },
      });
      return guard.error;
    }

    const parsed = loginSchema.safeParse(guard.body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    // Check account lockout status before attempting authentication
    const lockout = checkAccountLockout(parsed.data.email);
    if (lockout.locked) {
      auditLogFromRequest(request, {
        event_type: "ACCOUNT_LOCKED",
        result: "DENIED",
        auth_method: "password",
        metadata: {
          email: parsed.data.email,
          permanent: lockout.permanent,
          remaining_ms: lockout.remainingMs,
        },
      });
      return NextResponse.json(
        {
          error: "Account temporarily locked due to too many failed attempts.",
          locked: true,
          remainingMs: lockout.remainingMs,
        },
        { status: 423 },
      );
    }

    try {
      const env = getServerEnv();
      const urls = getKeycloakUrls();

      const tokenBody = new URLSearchParams({
        grant_type: "password",
        client_id: env.KEYCLOAK_CLIENT_ID,
        client_secret: env.KEYCLOAK_CLIENT_SECRET,
        username: parsed.data.email,
        password: parsed.data.password,
        scope: "openid email profile",
      });

      const tokenRes = await fetch(urls.token, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: tokenBody.toString(),
      });

      if (!tokenRes.ok) {
        const error = await tokenRes.json().catch(() => ({}));

        if (
          error.error === "invalid_grant" &&
          error.error_description?.includes("requires action")
        ) {
          auditLogFromRequest(request, {
            event_type: "LOGIN",
            result: "SUCCESS",
            auth_method: "password",
            metadata: { mfa_required: true, email: parsed.data.email },
          });
          return NextResponse.json({ mfaRequired: true }, { status: 200 });
        }

        // Record failed attempt for brute-force tracking
        const lockResult = recordFailedAttempt(parsed.data.email);
        recordGlobalAttempt(false);

        // Check for anomalous global failure rate
        if (isGlobalFailureRateAnomaly()) {
          console.warn("[SECURITY ALERT] Global login failure rate exceeds 10% threshold");
        }

        auditLogFromRequest(request, {
          event_type: "LOGIN_ERROR",
          result: "FAILURE",
          auth_method: "password",
          metadata: {
            email: parsed.data.email,
            reason: error.error_description || "invalid_credentials",
            attempts_remaining: lockResult.attemptsRemaining,
            account_locked: lockResult.locked,
          },
        });

        if (lockResult.locked) {
          auditLogFromRequest(request, {
            event_type: "ACCOUNT_LOCKED",
            result: "DENIED",
            auth_method: "password",
            metadata: { email: parsed.data.email, lockout_duration_ms: lockResult.remainingMs },
          });
          return NextResponse.json(
            {
              error: "Account temporarily locked due to too many failed attempts.",
              locked: true,
              remainingMs: lockResult.remainingMs,
            },
            { status: 423 },
          );
        }

        return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
      }

      const tokens = await tokenRes.json();

      // Record successful login — resets lockout tracking
      recordSuccessfulLogin(parsed.data.email);
      recordGlobalAttempt(true);

      setAccessTokenCookie(tokens.access_token);
      setRefreshTokenCookie(tokens.refresh_token, tokens.refresh_expires_in);

      const now = Date.now();
      setSessionMetaCookie({ idleStartMs: now, maxStartMs: now });

      // Extract user ID from access token for audit
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
        event_type: "LOGIN",
        result: "SUCCESS",
        user_id: userId,
        auth_method: "password",
        metadata: { email: parsed.data.email },
      });

      return NextResponse.json({ redirectTo: "/dashboard" });
    } catch (error) {
      console.error("[auth/login] Error:", error);
      auditLogFromRequest(request, {
        event_type: "LOGIN_ERROR",
        result: "ERROR",
        auth_method: "password",
        metadata: { reason: "internal_error" },
      });
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  });
}

/** GET /api/auth/login?sso=true — Initiate OIDC Authorization Code + PKCE flow */
export async function GET(request: NextRequest) {
  try {
    const env = getServerEnv();
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const state = generateRandomHex(32);

    setPkceVerifierCookie(codeVerifier);

    const redirectUri = `${env.NEXTAUTH_URL}/api/auth/callback`;
    const authUrl = buildAuthorizationUrl({ redirectUri, state, codeChallenge });

    auditLogFromRequest(request, {
      event_type: "LOGIN",
      result: "SUCCESS",
      auth_method: "oidc_pkce",
      metadata: { flow: "authorization_code_start" },
    });

    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error("[auth/login] SSO Error:", error);
    return NextResponse.redirect(new URL("/login?error=sso_failed", request.url));
  }
}
