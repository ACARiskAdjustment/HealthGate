import { describe, it, expect } from "vitest";
import {
  encrypt,
  decrypt,
  generateCodeVerifier,
  generateCodeChallenge,
  generateCsrfToken,
  validateCsrfToken,
  generateRandomHex,
} from "@/lib/crypto";

const TEST_KEY = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";
const TEST_SECRET = "test-csrf-secret-key-abc123";
const TEST_SESSION = "session-abc-123";

describe("encrypt / decrypt", () => {
  it("round-trips a plaintext string", () => {
    const plaintext = "my-secret-access-token";
    const encrypted = encrypt(plaintext, TEST_KEY);
    expect(encrypted).not.toBe(plaintext);
    expect(encrypted).toContain(":"); // iv:encrypted:tag format

    const decrypted = decrypt(encrypted, TEST_KEY);
    expect(decrypted).toBe(plaintext);
  });

  it("produces different ciphertexts for same plaintext (unique IV)", () => {
    const plaintext = "same-input";
    const a = encrypt(plaintext, TEST_KEY);
    const b = encrypt(plaintext, TEST_KEY);
    expect(a).not.toBe(b);
  });

  it("throws on tampered ciphertext", () => {
    const encrypted = encrypt("test", TEST_KEY);
    const parts = encrypted.split(":");
    parts[1] = "0000" + parts[1].slice(4); // tamper with encrypted data
    expect(() => decrypt(parts.join(":"), TEST_KEY)).toThrow();
  });

  it("handles empty string", () => {
    const encrypted = encrypt("", TEST_KEY);
    const decrypted = decrypt(encrypted, TEST_KEY);
    expect(decrypted).toBe("");
  });

  it("handles long strings", () => {
    const long = "x".repeat(10000);
    const encrypted = encrypt(long, TEST_KEY);
    const decrypted = decrypt(encrypted, TEST_KEY);
    expect(decrypted).toBe(long);
  });

  it("rejects key with wrong length", () => {
    expect(() => encrypt("test", "shortkey")).toThrow(/32 bytes/);
  });
});

describe("PKCE", () => {
  it("generates code verifier of correct length (43+ chars, base64url)", () => {
    const verifier = generateCodeVerifier();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier).toMatch(/^[A-Za-z0-9_=-]+$/);
  });

  it("generates unique verifiers", () => {
    const a = generateCodeVerifier();
    const b = generateCodeVerifier();
    expect(a).not.toBe(b);
  });

  it("generates valid S256 code challenge from verifier", async () => {
    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);
    expect(challenge).toMatch(/^[A-Za-z0-9_=-]+$/);
    expect(challenge.length).toBeGreaterThan(0);
  });

  it("produces deterministic challenge for same verifier", async () => {
    const verifier = generateCodeVerifier();
    const a = await generateCodeChallenge(verifier);
    const b = await generateCodeChallenge(verifier);
    expect(a).toBe(b);
  });
});

describe("CSRF tokens", () => {
  it("generates a CSRF token", () => {
    const token = generateCsrfToken(TEST_SESSION, TEST_SECRET);
    expect(token.length).toBeGreaterThan(0);
    expect(token).toContain(":"); // timestamp:hmac format
  });

  it("validates a correct CSRF token", () => {
    const token = generateCsrfToken(TEST_SESSION, TEST_SECRET);
    const isValid = validateCsrfToken(token, TEST_SESSION, TEST_SECRET);
    expect(isValid).toBe(true);
  });

  it("rejects token with wrong session", () => {
    const token = generateCsrfToken(TEST_SESSION, TEST_SECRET);
    const isValid = validateCsrfToken(token, "wrong-session", TEST_SECRET);
    expect(isValid).toBe(false);
  });

  it("rejects token with wrong secret", () => {
    const token = generateCsrfToken(TEST_SESSION, TEST_SECRET);
    const isValid = validateCsrfToken(token, TEST_SESSION, "wrong-secret");
    expect(isValid).toBe(false);
  });

  it("rejects malformed token", () => {
    expect(validateCsrfToken("not-a-valid-token", TEST_SESSION, TEST_SECRET)).toBe(false);
  });
});

describe("generateRandomHex", () => {
  it("generates hex string of specified byte length", () => {
    const hex = generateRandomHex(32);
    expect(hex).toMatch(/^[0-9a-f]+$/);
    expect(hex.length).toBe(64); // 32 bytes = 64 hex chars
  });

  it("generates unique values", () => {
    const a = generateRandomHex(16);
    const b = generateRandomHex(16);
    expect(a).not.toBe(b);
  });
});
