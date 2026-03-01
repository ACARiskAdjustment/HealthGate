import { NextRequest, NextResponse } from "next/server";
import { getServerEnv } from "@/types/env";
import { exchangeCodeForTokens } from "@/lib/keycloak";
import {
  setAccessTokenCookie,
  setRefreshTokenCookie,
  setSessionMetaCookie,
  getPkceVerifier,
} from "@/lib/cookies";
import { auditLogFromRequest } from "@/lib/audit";

/** GET /api/auth/callback — OIDC Authorization Code callback with PKCE */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  if (error) {
    console.error(`[auth/callback] Keycloak error: ${error} - ${errorDescription}`);
    auditLogFromRequest(request, {
      event_type: "LOGIN_ERROR",
      result: "FAILURE",
      auth_method: "oidc_pkce",
      metadata: { reason: error, description: errorDescription || "" },
    });
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error)}`, request.url));
  }

  if (!code) {
    auditLogFromRequest(request, {
      event_type: "LOGIN_ERROR",
      result: "FAILURE",
      auth_method: "oidc_pkce",
      metadata: { reason: "missing_authorization_code" },
    });
    return NextResponse.redirect(new URL("/login?error=missing_code", request.url));
  }

  const codeVerifier = getPkceVerifier();
  if (!codeVerifier) {
    auditLogFromRequest(request, {
      event_type: "LOGIN_ERROR",
      result: "FAILURE",
      auth_method: "oidc_pkce",
      metadata: { reason: "missing_pkce_verifier" },
    });
    return NextResponse.redirect(new URL("/login?error=missing_verifier", request.url));
  }

  try {
    const env = getServerEnv();
    const redirectUri = `${env.NEXTAUTH_URL}/api/auth/callback`;
    const tokens = await exchangeCodeForTokens({ code, redirectUri, codeVerifier });

    setAccessTokenCookie(tokens.access_token);
    setRefreshTokenCookie(tokens.refresh_token, tokens.refresh_expires_in);

    const now = Date.now();
    setSessionMetaCookie({ idleStartMs: now, maxStartMs: now });

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
      auth_method: "oidc_pkce",
      session_id: tokens.session_state,
    });

    return NextResponse.redirect(new URL("/", request.url));
  } catch (error) {
    console.error("[auth/callback] Error:", error);
    auditLogFromRequest(request, {
      event_type: "LOGIN_ERROR",
      result: "ERROR",
      auth_method: "oidc_pkce",
      metadata: { reason: "token_exchange_failed" },
    });
    return NextResponse.redirect(new URL("/login?error=callback_failed", request.url));
  }
}
