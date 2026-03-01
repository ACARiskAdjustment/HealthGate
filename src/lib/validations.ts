import { z } from "zod";

/** Login form schema */
export const loginSchema = z.object({
  email: z
    .string()
    .min(1, "Email address is required")
    .email("Enter a valid email address")
    .max(254, "Email must be 254 characters or fewer")
    .transform((v) => v.toLowerCase().trim()),
  password: z.string().min(1, "Password is required"),
});
export type LoginFormValues = z.infer<typeof loginSchema>;

/** Registration form schema */
export const registerSchema = z
  .object({
    firstName: z
      .string()
      .min(1, "First name is required")
      .max(255, "First name must be 255 characters or fewer"),
    lastName: z
      .string()
      .min(1, "Last name is required")
      .max(255, "Last name must be 255 characters or fewer"),
    email: z
      .string()
      .min(1, "Email address is required")
      .email("Enter a valid email address")
      .max(254, "Email must be 254 characters or fewer")
      .transform((v) => v.toLowerCase().trim()),
    password: z
      .string()
      .min(12, "Password must be at least 12 characters")
      .max(128, "Password must be 128 characters or fewer")
      .regex(/[A-Z]/, "Password must include at least one uppercase letter")
      .regex(/[a-z]/, "Password must include at least one lowercase letter")
      .regex(/[0-9]/, "Password must include at least one number")
      .regex(
        /[!@#$%^&*()\-_=+\[\]{};:'",.<>?/\\|~]/,
        "Password must include at least one special character",
      ),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
export type RegisterFormValues = z.infer<typeof registerSchema>;

/** MFA TOTP verification schema */
export const mfaSchema = z.object({
  totp_code: z
    .string()
    .min(1, "Verification code is required")
    .regex(/^\d{6}$/, "Code must be exactly 6 digits")
    .transform((v) => v.replace(/\D/g, "")),
  remember_device: z.boolean().optional().default(false),
});
export type MfaFormValues = z.infer<typeof mfaSchema>;

/** MFA setup schema (same code validation, but during enrollment) */
export const mfaSetupSchema = z.object({
  totp_code: z
    .string()
    .min(1, "Verification code is required")
    .regex(/^\d{6}$/, "Code must be exactly 6 digits")
    .transform((v) => v.replace(/\D/g, "")),
});
export type MfaSetupFormValues = z.infer<typeof mfaSetupSchema>;

/** Recovery code schema */
export const recoveryCodeSchema = z.object({
  recovery_code: z
    .string()
    .min(1, "Recovery code is required")
    .regex(/^[a-z0-9]{5}-[a-z0-9]{5}$/, "Code format: xxxxx-xxxxx")
    .transform((v) => v.toLowerCase().trim()),
});
export type RecoveryCodeFormValues = z.infer<typeof recoveryCodeSchema>;

/** Forgot password schema */
export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .min(1, "Email address is required")
    .email("Enter a valid email address")
    .max(254, "Email must be 254 characters or fewer")
    .transform((v) => v.toLowerCase().trim()),
});
export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

/** Reset password schema */
export const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(12, "Password must be at least 12 characters")
      .max(128, "Password must be 128 characters or fewer")
      .regex(/[A-Z]/, "Password must include at least one uppercase letter")
      .regex(/[a-z]/, "Password must include at least one lowercase letter")
      .regex(/[0-9]/, "Password must include at least one number")
      .regex(
        /[!@#$%^&*()\-_=+\[\]{};:'",.<>?/\\|~]/,
        "Password must include at least one special character",
      ),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
export type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;
