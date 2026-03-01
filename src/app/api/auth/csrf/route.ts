import { NextRequest, NextResponse } from "next/server";
import { generateRandomHex } from "@/lib/crypto";
import { setCsrfCookie } from "@/lib/cookies";
import { RATE_LIMITS, applyRateLimit } from "@/lib/rate-limit";
import type { CsrfResponse } from "@/types/auth";

/** GET /api/auth/csrf — Generate and return a CSRF token. Rate limited: 200/min per IP. */
export async function GET(request: NextRequest) {
  const rateLimited = applyRateLimit(request, "CSRF", RATE_LIMITS.CSRF);
  if (rateLimited) return rateLimited;

  const token = generateRandomHex(32);
  setCsrfCookie(token);

  const response: CsrfResponse = { token };
  return NextResponse.json(response);
}
