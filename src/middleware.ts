import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { requestDuration, observeHistogram } from "@/lib/metrics";

const isDev = process.env.NODE_ENV !== "production";

/** Security headers applied to every response per the Security Design Review */
const securityHeaders: Record<string, string> = {
  // CSP — restrictive per Security Review §6.1, no unsafe-eval
  // In development: allow 'unsafe-inline' for scripts (Next.js hydration uses inline scripts)
  // In production: use CSP nonces via next.config.js for inline script allowlisting
  "Content-Security-Policy": [
    "default-src 'self'",
    isDev ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' https://fonts.gstatic.com https://api.fontshare.com",
    "connect-src 'self' " + (process.env.KEYCLOAK_URL || "http://localhost:8080") + (isDev ? " ws://localhost:3000" : ""),
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "form-action 'self' " + (process.env.KEYCLOAK_URL || "http://localhost:8080"),
    "base-uri 'self'",
    "object-src 'none'",
    "media-src 'none'",
    "worker-src 'self'",
    "manifest-src 'self'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
    "block-all-mixed-content",
  ].join("; "),

  // HSTS — 1 year, includeSubDomains, preload-ready (production only)
  ...(isDev ? {} : { "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload" }),

  // Legacy clickjacking protection
  "X-Frame-Options": "DENY",

  // Prevent MIME type sniffing
  "X-Content-Type-Options": "nosniff",

  // Referrer policy — prevent token/path leakage
  "Referrer-Policy": "strict-origin-when-cross-origin",

  // Permissions policy — disable all unnecessary browser APIs
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=(), ambient-light-sensor=(), autoplay=(), encrypted-media=(), fullscreen=(self), picture-in-picture=()",

  // Disable DNS prefetching
  "X-DNS-Prefetch-Control": "off",

  // Cross-origin isolation (Spectre mitigation)
  // Disabled in dev: require-corp blocks external fonts (Google Fonts, Fontshare)
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": isDev ? "same-site" : "same-origin",
  ...(isDev ? {} : { "Cross-Origin-Embedder-Policy": "require-corp" }),
};

/** Auth page paths that should have no-cache headers */
const AUTH_PATHS = [
  "/login",
  "/register",
  "/login/mfa",
  "/setup-mfa",
  "/forgot-password",
  "/reset-password",
  "/session-expired",
  "/account-locked",
  "/logout",
];

export function middleware(request: NextRequest) {
  const startMs = Date.now();
  const response = NextResponse.next();

  // Skip security headers in development to avoid CSP blocking Next.js dev tooling
  if (!isDev) {
    for (const [key, value] of Object.entries(securityHeaders)) {
      response.headers.set(key, value);
    }
  }

  // Request correlation ID for tracing
  const requestId = uuidv4();
  response.headers.set("X-Request-Id", requestId);
  // Pass request ID via response headers (avoid mutating request which can drop the body)
  response.headers.set("X-Correlation-Id", requestId);

  // Cache-Control: no-store for all auth pages
  const pathname = request.nextUrl.pathname;
  if (AUTH_PATHS.some((path) => pathname.startsWith(path)) || pathname.startsWith("/api/auth")) {
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
    response.headers.set("Pragma", "no-cache");
  }

  // Remove X-Powered-By (also set in next.config but belt-and-suspenders)
  response.headers.delete("X-Powered-By");

  // Record request duration metric
  const durationSec = (Date.now() - startMs) / 1000;
  observeHistogram(requestDuration, {
    route: pathname,
    method: request.method,
    status_code: response.status.toString(),
  }, durationSec);

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
