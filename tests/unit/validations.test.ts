import { describe, it, expect } from "vitest";
import {
  loginSchema,
  registerSchema,
  mfaSchema,
  mfaSetupSchema,
  recoveryCodeSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "@/lib/validations";

describe("loginSchema", () => {
  it("accepts valid email and password", () => {
    const result = loginSchema.safeParse({ email: "user@example.com", password: "pass" });
    expect(result.success).toBe(true);
  });

  it("rejects empty email", () => {
    const result = loginSchema.safeParse({ email: "", password: "pass" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email format", () => {
    const result = loginSchema.safeParse({ email: "not-an-email", password: "pass" });
    expect(result.success).toBe(false);
  });

  it("rejects empty password", () => {
    const result = loginSchema.safeParse({ email: "user@example.com", password: "" });
    expect(result.success).toBe(false);
  });
});

describe("registerSchema", () => {
  const validData = {
    firstName: "Jane",
    lastName: "Doe",
    email: "jane@example.com",
    password: "SecureP@ss123!",
    confirmPassword: "SecureP@ss123!",
  };

  it("accepts valid registration data", () => {
    const result = registerSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it("rejects password shorter than 12 characters", () => {
    const result = registerSchema.safeParse({ ...validData, password: "Short1!", confirmPassword: "Short1!" });
    expect(result.success).toBe(false);
  });

  it("rejects password without uppercase", () => {
    const result = registerSchema.safeParse({
      ...validData,
      password: "nouppercase123!",
      confirmPassword: "nouppercase123!",
    });
    expect(result.success).toBe(false);
  });

  it("rejects password without lowercase", () => {
    const result = registerSchema.safeParse({
      ...validData,
      password: "NOLOWERCASE123!",
      confirmPassword: "NOLOWERCASE123!",
    });
    expect(result.success).toBe(false);
  });

  it("rejects password without number", () => {
    const result = registerSchema.safeParse({
      ...validData,
      password: "NoNumberHere!!",
      confirmPassword: "NoNumberHere!!",
    });
    expect(result.success).toBe(false);
  });

  it("rejects password without special character", () => {
    const result = registerSchema.safeParse({
      ...validData,
      password: "NoSpecialChar12",
      confirmPassword: "NoSpecialChar12",
    });
    expect(result.success).toBe(false);
  });

  it("rejects mismatched passwords", () => {
    const result = registerSchema.safeParse({
      ...validData,
      confirmPassword: "DifferentP@ss1!",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty first name", () => {
    const result = registerSchema.safeParse({ ...validData, firstName: "" });
    expect(result.success).toBe(false);
  });
});

describe("mfaSchema", () => {
  it("accepts valid 6-digit code", () => {
    const result = mfaSchema.safeParse({ totp_code: "123456" });
    expect(result.success).toBe(true);
  });

  it("rejects non-numeric code", () => {
    const result = mfaSchema.safeParse({ totp_code: "abcdef" });
    expect(result.success).toBe(false);
  });

  it("rejects code shorter than 6 digits", () => {
    const result = mfaSchema.safeParse({ totp_code: "12345" });
    expect(result.success).toBe(false);
  });

  it("rejects code longer than 6 digits", () => {
    const result = mfaSchema.safeParse({ totp_code: "1234567" });
    expect(result.success).toBe(false);
  });
});

describe("mfaSetupSchema", () => {
  it("accepts valid 6-digit code", () => {
    const result = mfaSetupSchema.safeParse({ totp_code: "654321" });
    expect(result.success).toBe(true);
  });
});

describe("recoveryCodeSchema", () => {
  it("accepts valid recovery code format (xxxxx-xxxxx)", () => {
    const result = recoveryCodeSchema.safeParse({ recovery_code: "ab12c-de34f" });
    expect(result.success).toBe(true);
  });

  it("rejects wrong format", () => {
    const result = recoveryCodeSchema.safeParse({ recovery_code: "invalid" });
    expect(result.success).toBe(false);
  });
});

describe("forgotPasswordSchema", () => {
  it("accepts valid email", () => {
    const result = forgotPasswordSchema.safeParse({ email: "user@example.com" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = forgotPasswordSchema.safeParse({ email: "bad" });
    expect(result.success).toBe(false);
  });
});

describe("resetPasswordSchema", () => {
  it("accepts matching valid passwords with token", () => {
    const result = resetPasswordSchema.safeParse({
      password: "NewSecureP@ss1!",
      confirmPassword: "NewSecureP@ss1!",
      token: "abc123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects weak password", () => {
    const result = resetPasswordSchema.safeParse({
      password: "weak",
      confirmPassword: "weak",
      token: "abc123",
    });
    expect(result.success).toBe(false);
  });
});
