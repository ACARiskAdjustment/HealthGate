"use client";

import * as React from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, ShieldCheck } from "lucide-react";
import { mfaSchema, type MfaFormValues } from "@/lib/validations";
import { AuthLayout } from "@/components/layout/auth-layout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { OtpInput } from "@/components/auth/otp-input";
import { FormBanner } from "@/components/auth/form-banner";

export default function MfaVerificationPage() {
  const [formError, setFormError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [failureCount, setFailureCount] = React.useState(0);

  const form = useForm<MfaFormValues>({
    resolver: zodResolver(mfaSchema),
    defaultValues: { totp_code: "", remember_device: false },
  });

  async function onSubmit(data: MfaFormValues) {
    setFormError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/auth/mfa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const newCount = failureCount + 1;
        setFailureCount(newCount);

        if (newCount >= 5) {
          window.location.href = "/account-locked";
          return;
        }

        // Clear OTP input on failure and add input delay per security review
        form.setValue("totp_code", "");
        setFormError(body.error || "Invalid verification code. Please try again.");
        return;
      }

      const result = await res.json();
      window.location.href = result.redirectTo || "/";
    } catch {
      setFormError("Unable to verify. Please check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  // Auto-submit when 6 digits are entered
  const totpValue = form.watch("totp_code");
  React.useEffect(() => {
    if (totpValue.length === 6 && /^\d{6}$/.test(totpValue)) {
      form.handleSubmit(onSubmit)();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totpValue]);

  return (
    <AuthLayout>
      <Card className="border-0 shadow-card">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <ShieldCheck className="h-6 w-6 text-primary" aria-hidden="true" />
          </div>
          <CardTitle>Two-factor authentication</CardTitle>
          <CardDescription>
            Enter the 6-digit code from your authenticator app
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
              {formError && <FormBanner message={formError} />}

              <FormField
                control={form.control}
                name="totp_code"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <OtpInput
                        value={field.value}
                        onChange={field.onChange}
                        disabled={isSubmitting}
                        autoFocus
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex items-center gap-2">
                <FormField
                  control={form.control}
                  name="remember_device"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2">
                      <FormControl>
                        <input
                          type="checkbox"
                          checked={field.value}
                          onChange={field.onChange}
                          className="h-4 w-4 rounded border-input"
                          id="remember-device"
                        />
                      </FormControl>
                      <label
                        htmlFor="remember-device"
                        className="text-sm text-muted-foreground cursor-pointer"
                      >
                        Trust this device for 30 days
                      </label>
                    </FormItem>
                  )}
                />
              </div>

              <Button
                type="submit"
                className="w-full h-10"
                disabled={isSubmitting || totpValue.length < 6}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  "Verify"
                )}
              </Button>
            </form>
          </Form>

          <div className="mt-4 text-center">
            <Link
              href="/login/mfa/recovery"
              className="text-sm text-primary hover:underline"
            >
              Use a recovery code instead
            </Link>
          </div>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
