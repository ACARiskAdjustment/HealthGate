import { createHash } from "crypto";
import type { NextRequest } from "next/server";

/**
 * Structured audit logging service for HealthGate.
 *
 * Per Security Review §HIPAA 164.312(b):
 * - 23+ event types logged in structured JSON
 * - Each entry includes: timestamp, event_type, user_id, ip_address, user_agent,
 *   session_id, client_id, realm, auth_method, result, correlation_id
 * - 6-year-210-day retention via Elasticsearch ILM (configured externally)
 * - Tamper-evident SHA-256 hash chain
 * - Logs EXCLUDE: passwords, MFA secrets, tokens, recovery codes, PHI
 */

/** All supported audit event types */
export type AuditEventType =
  | "LOGIN"
  | "LOGIN_ERROR"
  | "LOGOUT"
  | "REGISTER"
  | "REGISTER_ERROR"
  | "MFA_VERIFY"
  | "MFA_VERIFY_ERROR"
  | "MFA_SETUP"
  | "MFA_SETUP_ERROR"
  | "PASSWORD_RESET_REQUEST"
  | "PASSWORD_RESET_COMPLETE"
  | "PASSWORD_RESET_ERROR"
  | "TOKEN_REFRESH"
  | "TOKEN_REFRESH_ERROR"
  | "SESSION_EXPIRED"
  | "SESSION_EXTEND"
  | "ACCOUNT_LOCKED"
  | "ACCOUNT_UNLOCKED"
  | "CSRF_VIOLATION"
  | "RATE_LIMIT_EXCEEDED"
  | "ADMIN_USER_UPDATE"
  | "ADMIN_SESSION_TERMINATE"
  | "ADMIN_POLICY_CHANGE";

export type AuditResult = "SUCCESS" | "FAILURE" | "DENIED" | "ERROR";

/** Core audit log entry — all required fields per security review */
export interface AuditEntry {
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Event type from the defined set */
  event_type: AuditEventType;
  /** User ID (UUID) — null for unauthenticated events */
  user_id: string | null;
  /** Client IP address */
  ip_address: string;
  /** User-Agent string */
  user_agent: string;
  /** Keycloak session ID — null if no session */
  session_id: string | null;
  /** OIDC client ID */
  client_id: string;
  /** Keycloak realm */
  realm: string;
  /** Authentication method used */
  auth_method: string;
  /** Result of the operation */
  result: AuditResult;
  /** Request correlation ID (X-Request-Id UUID) */
  correlation_id: string;
  /** Additional metadata (NEVER includes secrets, tokens, or PHI) */
  metadata?: Record<string, string | number | boolean>;
  /** SHA-256 hash chain — hash of this entry + previous entry's hash */
  chain_hash: string;
}

/** Admin-specific audit fields */
export interface AdminAuditEntry extends AuditEntry {
  admin_user_id: string;
  target_entity: string;
  old_value?: string;
  new_value?: string;
}

/** Last hash in the chain — for tamper-evidence */
let previousHash = "0000000000000000000000000000000000000000000000000000000000000000";

/**
 * Compute SHA-256 hash chain entry.
 * Each entry's hash = SHA-256(JSON(entry without chain_hash) + previous_hash)
 */
function computeChainHash(entry: Omit<AuditEntry, "chain_hash">): string {
  const payload = JSON.stringify(entry) + previousHash;
  const hash = createHash("sha256").update(payload).digest("hex");
  previousHash = hash;
  return hash;
}

/**
 * Extract audit context from a Next.js request.
 */
export function extractAuditContext(request: NextRequest): {
  ip_address: string;
  user_agent: string;
  correlation_id: string;
} {
  const xff = request.headers.get("x-forwarded-for");
  const ip_address = xff ? xff.split(",")[0].trim() : request.headers.get("x-real-ip") || "unknown";
  const user_agent = request.headers.get("user-agent") || "unknown";
  const correlation_id = request.headers.get("x-request-id") || "unknown";

  return { ip_address, user_agent, correlation_id };
}

/**
 * Emit a structured audit log entry.
 *
 * Outputs JSON to stdout, which is consumed by the ELK pipeline
 * (Filebeat → Logstash → Elasticsearch) in production.
 */
export function auditLog(params: {
  event_type: AuditEventType;
  result: AuditResult;
  user_id?: string | null;
  ip_address: string;
  user_agent: string;
  session_id?: string | null;
  correlation_id: string;
  auth_method?: string;
  metadata?: Record<string, string | number | boolean>;
}): void {
  const realm = process.env.KEYCLOAK_REALM || "healthgate-clinician";
  const client_id = process.env.KEYCLOAK_CLIENT_ID || "healthgate-dev";

  const entryWithoutHash = {
    timestamp: new Date().toISOString(),
    event_type: params.event_type,
    user_id: params.user_id ?? null,
    ip_address: params.ip_address,
    user_agent: sanitizeUserAgent(params.user_agent),
    session_id: params.session_id ?? null,
    client_id,
    realm,
    auth_method: params.auth_method || "unknown",
    result: params.result,
    correlation_id: params.correlation_id,
    ...(params.metadata && { metadata: sanitizeMetadata(params.metadata) }),
  };

  const chain_hash = computeChainHash(entryWithoutHash);

  const entry: AuditEntry = {
    ...entryWithoutHash,
    chain_hash,
  };

  // Output structured JSON to stdout (consumed by Filebeat/Fluentd in production)
  // Using console.log with JSON.stringify for machine-parseable output
  process.stdout.write(JSON.stringify(entry) + "\n");
}

/**
 * Convenience wrapper: log from a request context.
 */
export function auditLogFromRequest(
  request: NextRequest,
  params: {
    event_type: AuditEventType;
    result: AuditResult;
    user_id?: string | null;
    session_id?: string | null;
    auth_method?: string;
    metadata?: Record<string, string | number | boolean>;
  },
): void {
  const context = extractAuditContext(request);
  auditLog({
    ...params,
    ip_address: context.ip_address,
    user_agent: context.user_agent,
    correlation_id: context.correlation_id,
  });
}

/** Fields that MUST NEVER appear in audit log metadata */
const REDACTED_FIELDS = new Set([
  "password",
  "secret",
  "token",
  "access_token",
  "refresh_token",
  "id_token",
  "code_verifier",
  "code_challenge",
  "totp_code",
  "recovery_code",
  "credential",
  "mfa_secret",
  "cookie",
  "authorization",
  "phi",
  "diagnosis",
  "medication",
  "lab_result",
]);

/**
 * Sanitize metadata to ensure no secrets, tokens, or PHI are logged.
 */
function sanitizeMetadata(
  metadata: Record<string, string | number | boolean>,
): Record<string, string | number | boolean> {
  const sanitized: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(metadata)) {
    const lowerKey = key.toLowerCase();
    if (REDACTED_FIELDS.has(lowerKey)) {
      sanitized[key] = "[REDACTED]";
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * Truncate user-agent to prevent log injection and unbounded storage.
 */
function sanitizeUserAgent(ua: string): string {
  // Strip control characters and limit length
  return ua.replace(/[\x00-\x1f\x7f]/g, "").slice(0, 500);
}
