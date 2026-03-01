import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock getServerEnv
vi.mock("@/types/env", () => ({
  getServerEnv: () => ({
    COOKIE_ENCRYPTION_KEY: "a".repeat(64),
    KEYCLOAK_URL: "http://localhost:8080",
    KEYCLOAK_REALM: "test",
    KEYCLOAK_CLIENT_ID: "test-client",
    KEYCLOAK_CLIENT_SECRET: "test-secret",
    NEXTAUTH_URL: "http://localhost:3000",
  }),
}));

import { auditLog, extractAuditContext } from "@/lib/audit";

describe("auditLog", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
  });

  it("outputs structured JSON to stdout", () => {
    auditLog({
      event_type: "LOGIN",
      result: "SUCCESS",
      user_id: "user-123",
      ip_address: "1.2.3.4",
      user_agent: "TestBrowser/1.0",
      correlation_id: "test-corr-1",
      auth_method: "password",
    });

    expect(stdoutSpy).toHaveBeenCalledOnce();
    const output = (stdoutSpy.mock.calls[0][0] as string).trim();
    const parsed = JSON.parse(output);

    expect(parsed.event_type).toBe("LOGIN");
    expect(parsed.result).toBe("SUCCESS");
    expect(parsed.user_id).toBe("user-123");
    expect(parsed.ip_address).toBe("1.2.3.4");
    expect(parsed.timestamp).toBeDefined();
  });

  it("includes hash chain (current + previous hash)", () => {
    auditLog({
      event_type: "LOGIN",
      result: "SUCCESS",
      ip_address: "1.2.3.4",
      user_agent: "TestBrowser/1.0",
      correlation_id: "test-corr-2",
    });

    const output = (stdoutSpy.mock.calls[0][0] as string).trim();
    const parsed = JSON.parse(output);

    expect(parsed.chain_hash).toBeDefined();
    expect(parsed.chain_hash.length).toBe(64); // SHA-256 hex
  });

  it("chains hashes — second entry references first", () => {
    auditLog({ event_type: "LOGIN", result: "SUCCESS", ip_address: "1.2.3.4", user_agent: "T/1", correlation_id: "c1" });
    auditLog({ event_type: "LOGOUT", result: "SUCCESS", ip_address: "1.2.3.4", user_agent: "T/1", correlation_id: "c2" });

    const first = JSON.parse((stdoutSpy.mock.calls[0][0] as string).trim());
    const second = JSON.parse((stdoutSpy.mock.calls[1][0] as string).trim());

    // Both should have chain_hash
    expect(first.chain_hash).toBeDefined();
    expect(second.chain_hash).toBeDefined();
  });

  it("redacts sensitive fields in metadata", () => {
    auditLog({
      event_type: "LOGIN",
      result: "SUCCESS",
      ip_address: "1.2.3.4",
      user_agent: "TestBrowser/1.0",
      correlation_id: "test-corr-3",
      metadata: {
        password: "should-be-redacted",
        email: "visible@example.com",
        token: "also-redacted",
        secret: "hidden",
      },
    });

    const output = (stdoutSpy.mock.calls[0][0] as string).trim();
    const parsed = JSON.parse(output);

    expect(parsed.metadata.password).toBe("[REDACTED]");
    expect(parsed.metadata.token).toBe("[REDACTED]");
    expect(parsed.metadata.secret).toBe("[REDACTED]");
    expect(parsed.metadata.email).toBe("visible@example.com");
  });

  it("sanitizes user agent (strips control chars, 500 char limit)", () => {
    const longUA = "Mozilla/5.0 " + "x".repeat(600);
    auditLog({
      event_type: "LOGIN",
      result: "SUCCESS",
      ip_address: "1.2.3.4",
      user_agent: longUA,
      correlation_id: "test-corr-4",
    });

    const output = (stdoutSpy.mock.calls[0][0] as string).trim();
    const parsed = JSON.parse(output);
    expect(parsed.user_agent.length).toBeLessThanOrEqual(500);
  });
});

describe("extractAuditContext", () => {
  it("extracts IP and user agent from request headers", () => {
    const headers = new Headers({
      "x-forwarded-for": "10.0.0.1",
      "user-agent": "TestBrowser/1.0",
      "x-request-id": "req-123",
    });
    const request = { headers } as any;

    const ctx = extractAuditContext(request);
    expect(ctx.ip_address).toBe("10.0.0.1");
    expect(ctx.user_agent).toBe("TestBrowser/1.0");
    expect(ctx.correlation_id).toBe("req-123");
  });
});
