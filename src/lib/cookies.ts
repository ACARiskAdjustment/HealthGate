import { cookies } from "next/headers";
import { encrypt, decrypt } from "./crypto";
import { getServerEnv } from "@/types/env";

/** Cookie names per the architecture doc */
export const COOKIE_NAMES = {
  ACCESS_TOKEN: "hg-access-token",
  REFRESH_TOKEN: "hg-refresh-token",
  CSRF: "hg-csrf",
  PKCE_VERIFIER: "hg-pkce-verifier",
  DEVICE_TRUST: "hg-device-trust",
  SESSION_META: "hg-session-meta",
} as const;

/** Cookie configuration per the security review */
const isProduction = process.env.NODE_ENV === "production";

interface CookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "strict" | "lax" | "none";
  path: string;
  maxAge?: number;
  domain?: string;
}

function baseCookieOptions(path: string = "/", maxAge?: number): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path,
    ...(maxAge !== undefined && { maxAge }),
    ...(isProduction && { domain: ".googlehealth.com" }),
  };
}

/** Set the encrypted access token cookie (5 min TTL) */
export function setAccessTokenCookie(token: string) {
  const env = getServerEnv();
  const encrypted = encrypt(token, env.COOKIE_ENCRYPTION_KEY);
  cookies().set(COOKIE_NAMES.ACCESS_TOKEN, encrypted, baseCookieOptions("/", 300));
}

/** Get the decrypted access token from cookie */
export function getAccessToken(): string | null {
  const cookie = cookies().get(COOKIE_NAMES.ACCESS_TOKEN);
  if (!cookie?.value) return null;
  try {
    const env = getServerEnv();
    return decrypt(cookie.value, env.COOKIE_ENCRYPTION_KEY);
  } catch {
    return null;
  }
}

/** Set the encrypted refresh token cookie */
export function setRefreshTokenCookie(token: string, maxAge: number) {
  const env = getServerEnv();
  const encrypted = encrypt(token, env.COOKIE_ENCRYPTION_KEY);
  cookies().set(COOKIE_NAMES.REFRESH_TOKEN, encrypted, baseCookieOptions("/api/auth", maxAge));
}

/** Get the decrypted refresh token from cookie */
export function getRefreshToken(): string | null {
  const cookie = cookies().get(COOKIE_NAMES.REFRESH_TOKEN);
  if (!cookie?.value) return null;
  try {
    const env = getServerEnv();
    return decrypt(cookie.value, env.COOKIE_ENCRYPTION_KEY);
  } catch {
    return null;
  }
}

/** Set the CSRF cookie (readable by JS for double-submit pattern) */
export function setCsrfCookie(token: string) {
  cookies().set(COOKIE_NAMES.CSRF, token, {
    httpOnly: false, // Must be readable by JavaScript for double-submit
    secure: isProduction,
    sameSite: "strict",
    path: "/",
    maxAge: 86400,
    ...(isProduction && { domain: ".googlehealth.com" }),
  });
}

/** Get the CSRF token from cookie */
export function getCsrfToken(): string | null {
  return cookies().get(COOKIE_NAMES.CSRF)?.value ?? null;
}

/** Set the PKCE code verifier cookie (5 min TTL) */
export function setPkceVerifierCookie(verifier: string) {
  cookies().set(COOKIE_NAMES.PKCE_VERIFIER, verifier, baseCookieOptions("/api/auth/callback", 300));
}

/** Get the PKCE code verifier from cookie */
export function getPkceVerifier(): string | null {
  return cookies().get(COOKIE_NAMES.PKCE_VERIFIER)?.value ?? null;
}

/** Set the device trust cookie (30 day TTL) */
export function setDeviceTrustCookie(token: string) {
  cookies().set(COOKIE_NAMES.DEVICE_TRUST, token, baseCookieOptions("/", 2592000));
}

/** Set session metadata cookie */
export function setSessionMetaCookie(meta: { idleStartMs: number; maxStartMs: number }) {
  cookies().set(COOKIE_NAMES.SESSION_META, JSON.stringify(meta), {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/",
    ...(isProduction && { domain: ".googlehealth.com" }),
  });
}

/** Clear all auth cookies on logout */
export function clearAllAuthCookies() {
  const cookieStore = cookies();
  Object.values(COOKIE_NAMES).forEach((name) => {
    cookieStore.delete(name);
  });
}
