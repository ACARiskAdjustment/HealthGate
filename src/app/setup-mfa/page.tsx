"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, ShieldCheck, Copy, Check } from "lucide-react";
import { mfaSetupSchema, type MfaSetupFormValues } from "@/lib/validations";
import { AuthLayout } from "@/components/layout/auth-layout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { OtpInput } from "@/components/auth/otp-input";
import { FormBanner } from "@/components/auth/form-banner";

type SetupStep = "qr" | "verify" | "recovery";

export default function MfaSetupPage() {
  const [step, setStep] = React.useState<SetupStep>("qr");
  const [formError, setFormError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [qrCodeUrl, setQrCodeUrl] = React.useState<string | null>(null);
  const [secretKey, setSecretKey] = React.useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = React.useState<string[]>([]);
  const [copied, setCopied] = React.useState(false);

  const form = useForm<MfaSetupFormValues>({
    resolver: zodResolver(mfaSetupSchema),
    defaultValues: { totp_code: "" },
  });

  // Fetch QR code on mount
  React.useEffect(() => {
    fetch("/api/auth/mfa-setup", { method: "GET" })
      .then((res) => res.json())
      .then((data) => {
        setQrCodeUrl(data.qrCodeUrl);
        setSecretKey(data.secretKey);
      })
      .catch(() => setFormError("Failed to initialize MFA setup."));
  }, []);

  async function onSubmit(data: MfaSetupFormValues) {
    setFormError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/auth/mfa-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        form.setValue("totp_code", "");
        setFormError(body.error || "Invalid code. Please try again.");
        return;
      }

      const result = await res.json();
      setRecoveryCodes(result.recovery_codes);
      setStep("recovery");
    } catch {
      setFormError("Unable to verify. Please check your connection.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleCopyRecoveryCodes() {
    navigator.clipboard.writeText(recoveryCodes.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleFinish() {
    window.location.href = "/";
  }

  return (
    <AuthLayout>
      <Card className="border-0 shadow-card">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <ShieldCheck className="h-6 w-6 text-primary" aria-hidden="true" />
          </div>
          <CardTitle>
            {step === "recovery" ? "Save recovery codes" : "Set up two-factor authentication"}
          </CardTitle>
          <CardDescription>
            {step === "qr" && "Scan the QR code with your authenticator app"}
            {step === "verify" && "Enter the 6-digit code from your authenticator app"}
            {step === "recovery" &&
              "Store these codes in a safe place. Each code can only be used once."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === "qr" && (
            <div className="space-y-4">
              <div className="flex justify-center">
                {qrCodeUrl ? (
                  // QR code rendered as data URI from the server
                  <img
                    src={qrCodeUrl}
                    alt="QR code for authenticator app"
                    className="h-48 w-48 rounded-lg border p-2"
                  />
                ) : (
                  <div className="flex h-48 w-48 items-center justify-center rounded-lg border">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                )}
              </div>
              {secretKey && (
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">
                    Can&apos;t scan? Enter this key manually:
                  </p>
                  <code className="mt-1 block text-sm font-mono tracking-wider text-foreground">
                    {secretKey}
                  </code>
                </div>
              )}
              <Button className="w-full h-10" onClick={() => setStep("verify")}>
                Continue
              </Button>
            </div>
          )}

          {step === "verify" && (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
                {formError && <FormBanner message={formError} />}

                <FormField
                  control={form.control}
                  name="totp_code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="sr-only">Verification code</FormLabel>
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

                <Button
                  type="submit"
                  className="w-full h-10"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    "Verify and activate"
                  )}
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => setStep("qr")}
                >
                  Back to QR code
                </Button>
              </form>
            </Form>
          )}

          {step === "recovery" && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="grid grid-cols-2 gap-2 font-mono text-sm">
                  {recoveryCodes.map((code, i) => (
                    <div key={i} className="text-center py-1">
                      {code}
                    </div>
                  ))}
                </div>
              </div>

              <Button
                variant="outline"
                className="w-full"
                onClick={handleCopyRecoveryCodes}
              >
                {copied ? (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy recovery codes
                  </>
                )}
              </Button>

              <Button className="w-full h-10" onClick={handleFinish}>
                I&apos;ve saved my recovery codes
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
