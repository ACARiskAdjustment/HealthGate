"use client";

import * as React from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Building2 } from "lucide-react";
import { loginSchema, type LoginFormValues } from "@/lib/validations";
import type { HealthGateLoginProps, HealthGateError, HealthGateUser } from "@/types/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { PasswordInput } from "@/components/auth/password-input";
import { FormBanner } from "@/components/auth/form-banner";
import { BrandHeader } from "@/components/layout/brand-header";

/** UI-level throttle delays per security review Section 8.2 */
const THROTTLE_DELAYS = [0, 0, 2000, 2000, 5000];

/**
 * Embeddable HealthGate login component.
 * Can be dropped into any consuming application wrapped in a HealthGateProvider.
 */
export function HealthGateLogin({
  appName = "your account",
  showSSO = true,
  showRegistration = true,
  onSuccess,
  onError,
  redirectUri,
  className,
  logo,
  footerContent,
}: HealthGateLoginProps) {
  const [formError, setFormError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [failureCount, setFailureCount] = React.useState(0);
  const [isThrottled, setIsThrottled] = React.useState(false);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(data: LoginFormValues) {
    setFormError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const newCount = failureCount + 1;
        setFailureCount(newCount);

        if (newCount >= 5) {
          const err: HealthGateError = {
            code: "ACCOUNT_LOCKED",
            message: body.error || "Account locked after too many attempts",
          };
          onError?.(err);
          window.location.href = "/account-locked";
          return;
        }

        const delay = THROTTLE_DELAYS[Math.min(newCount, THROTTLE_DELAYS.length - 1)];
        if (delay > 0) {
          setIsThrottled(true);
          setTimeout(() => setIsThrottled(false), delay);
        }

        const errorCode = body.locked ? "ACCOUNT_LOCKED" : "INVALID_CREDENTIALS";
        const err: HealthGateError = {
          code: errorCode,
          message: body.error || "Invalid email or password",
        };
        onError?.(err);
        setFormError(body.error || "Invalid email or password. Please try again.");
        return;
      }

      const result = await res.json();
      if (result.mfaRequired) {
        window.location.href = "/login/mfa";
        return;
      }

      // Fetch user for onSuccess callback
      if (onSuccess) {
        try {
          const sessionRes = await fetch("/api/auth/session");
          const session = await sessionRes.json();
          if (session.user) {
            onSuccess(session.user as HealthGateUser);
            return;
          }
        } catch {
          // Fall through to redirect
        }
      }

      window.location.href = redirectUri || result.redirectTo || "/";
    } catch {
      const err: HealthGateError = {
        code: "NETWORK_ERROR",
        message: "Unable to connect",
      };
      onError?.(err);
      setFormError("Unable to connect. Please check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleSSO() {
    window.location.href = "/api/auth/login?sso=true";
  }

  return (
    <div className={className}>
      <div className="flex min-h-screen flex-col items-center justify-center px-4">
        {logo || <BrandHeader />}

        <Card className="mt-8 w-full max-w-sm border-0 shadow-card">
          <CardHeader>
            <CardTitle>Welcome back</CardTitle>
            <CardDescription>
              Sign in to continue to {appName}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
                {formError && <FormBanner message={formError} />}

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email address</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="you@example.com"
                          autoComplete="email"
                          autoFocus
                          className="h-10"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <PasswordInput
                          autoComplete="current-password"
                          autoHideAfterMs={10000}
                          className="h-10"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end">
                  <Link
                    href="/forgot-password"
                    className="text-sm text-primary hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>

                <Button
                  type="submit"
                  className="w-full h-10"
                  disabled={isSubmitting || isThrottled}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    "Continue"
                  )}
                </Button>
              </form>
            </Form>

            {showSSO && (
              <>
                <div className="relative my-6">
                  <Separator />
                  <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
                    or continue with
                  </span>
                </div>

                <Button variant="outline" className="w-full h-10" onClick={handleSSO}>
                  <Building2 className="mr-2 h-4 w-4" />
                  SSO / SAML
                </Button>
              </>
            )}
          </CardContent>
          <CardFooter className="flex-col gap-2">
            {showRegistration && (
              <p className="text-sm text-muted-foreground">
                Don&apos;t have an account?{" "}
                <Link href="/register" className="font-medium text-primary hover:underline">
                  Sign up
                </Link>
              </p>
            )}
            {footerContent}
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
