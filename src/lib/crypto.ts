import { createCipheriv, createDecipheriv, randomBytes, createHmac, timingSafeEqual } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 12-byte nonce for GCM
const TAG_LENGTH = 16; // 16-byte auth tag
const ENCODING = "hex";

/**
 * Encrypt a string value using AES-256-GCM.
 * Output format: iv:encrypted:authTag (all hex-encoded)
 */
export function encrypt(plaintext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32) {
    throw new Error("Encryption key must be 32 bytes (64 hex characters)");
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", ENCODING);
  encrypted += cipher.final(ENCODING);

  const authTag = cipher.getAuthTag();

  return `${iv.toString(ENCODING)}:${encrypted}:${authTag.toString(ENCODING)}`;
}

/**
 * Decrypt an AES-256-GCM encrypted string.
 * Input format: iv:encrypted:authTag (all hex-encoded)
 */
export function decrypt(ciphertext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32) {
    throw new Error("Encryption key must be 32 bytes (64 hex characters)");
  }

  const parts = ciphertext.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid ciphertext format");
  }

  const iv = Buffer.from(parts[0], ENCODING);
  const encrypted = parts[1];
  const authTag = Buffer.from(parts[2], ENCODING);

  if (iv.length !== IV_LENGTH) {
    throw new Error("Invalid IV length");
  }
  if (authTag.length !== TAG_LENGTH) {
    throw new Error("Invalid auth tag length");
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, ENCODING, "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * Generate a PKCE code_verifier (43 random bytes, base64url-encoded).
 * Entropy: 256+ bits per OIDC spec.
 */
export function generateCodeVerifier(): string {
  return randomBytes(43).toString("base64url");
}

/**
 * Compute PKCE code_challenge from code_verifier.
 * code_challenge = BASE64URL(SHA-256(code_verifier))
 */
export async function generateCodeChallenge(codeVerifier: string): Promise<string> {
  const { createHash } = await import("crypto");
  const hash = createHash("sha256").update(codeVerifier).digest();
  return hash.toString("base64url");
}

/**
 * Generate a CSRF token using HMAC-SHA256.
 * Token = HMAC(sessionId + timestamp, serverSecret)
 */
export function generateCsrfToken(sessionId: string, secret: string): string {
  const timestamp = Date.now().toString();
  const hmac = createHmac("sha256", secret);
  hmac.update(`${sessionId}:${timestamp}`);
  return `${timestamp}:${hmac.digest("hex")}`;
}

/**
 * Validate a CSRF token.
 * Returns true if the token is valid and not expired (1 day max age).
 */
export function validateCsrfToken(
  token: string,
  sessionId: string,
  secret: string,
  maxAgeMs: number = 86400000,
): boolean {
  const parts = token.split(":");
  if (parts.length !== 2) return false;

  const [timestamp, hash] = parts;
  const age = Date.now() - parseInt(timestamp, 10);
  if (isNaN(age) || age < 0 || age > maxAgeMs) return false;

  const expected = createHmac("sha256", secret).update(`${sessionId}:${timestamp}`).digest("hex");

  // Constant-time comparison to prevent timing attacks
  try {
    return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

/**
 * Generate a random hex string of specified byte length.
 */
export function generateRandomHex(bytes: number = 32): string {
  return randomBytes(bytes).toString("hex");
}

/**
 * Generate a device trust cookie value.
 * Contains: HMAC(userId + deviceFingerprint + timestamp, serverSecret)
 */
export function generateDeviceTrustToken(
  userId: string,
  deviceFingerprint: string,
  secret: string,
): string {
  const timestamp = Date.now().toString();
  const hmac = createHmac("sha256", secret);
  hmac.update(`${userId}:${deviceFingerprint}:${timestamp}`);
  return `${timestamp}:${hmac.digest("hex")}`;
}
