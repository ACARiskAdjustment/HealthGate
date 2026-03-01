import { NextRequest, NextResponse } from "next/server";
import { getServerEnv } from "@/types/env";
import { getAccessToken, clearAllAuthCookies } from "@/lib/cookies";
import { getKeycloakUrls } from "@/lib/keycloak";
import { auditLogFromRequest } from "@/lib/audit";

/** POST /api/auth/logout — End session, clear cookies, redirect to Keycloak logout */
export async function POST(request: NextRequest) {
  let userId: string | null = null;
  let sessionId: string | null = null;

  try {
    const env = getServerEnv();
    const urls = getKeycloakUrls();
    const accessToken = getAccessToken();

    // Extract user info before clearing
    if (accessToken) {
      try {
        const payload = JSON.parse(
          Buffer.from(accessToken.split(".")[1], "base64").toString("utf8"),
        );
        userId = payload.sub;
        sessionId = payload.sid || payload.session_state;
      } catch {
        // Non-critical
      }
    }

    clearAllAuthCookies();

    const logoutParams = new URLSearchParams({
      post_logout_redirect_uri: `${env.NEXTAUTH_URL}/logout`,
    });
    if (accessToken) {
      logoutParams.set("id_token_hint", accessToken);
    }

    const logoutUrl = `${urls.logout}?${logoutParams.toString()}`;

    auditLogFromRequest(request, {
      event_type: "LOGOUT",
      result: "SUCCESS",
      user_id: userId,
      session_id: sessionId,
      auth_method: "user_initiated",
    });

    return NextResponse.json({ redirectTo: logoutUrl });
  } catch (error) {
    console.error("[auth/logout] Error:", error);
    clearAllAuthCookies();

    auditLogFromRequest(request, {
      event_type: "LOGOUT",
      result: "ERROR",
      user_id: userId,
      auth_method: "user_initiated",
      metadata: { reason: "logout_error" },
    });

    return NextResponse.json({ redirectTo: "/login" });
  }
}
