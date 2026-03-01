# HealthGate -- UX Design Finalization Document

**Document Version:** 1.0
**Author:** UX Lead, Google Health
**Date:** 2026-03-01
**Status:** DRAFT -- Pending Engineering Review
**Inputs:** 05-ux-ui-design-spec.md (Bare Metal UX Spec), 06-prd.md (PRD v1.0)
**Classification:** Google Confidential

---

## 1. Component Specifications

For each of the 10 screens, I specify the complete component tree, shadcn/ui configuration, form schema, state management, error handling, loading states, and keyboard behavior.

---

### S1: Login (`/login`)

**Component Tree:**

```
<LoginPage>
  <AuthLayout>                              // shared layout for all auth screens
    <BrandHeader />                         // Logo + \"HealthGate\" wordmark
    <Card className=\"shadow-card border-0 max-w-sm w-full\">
      <CardHeader>
        <CardTitle>Welcome back</CardTitle>  // Cormorant Garamond, text-3xl, font-normal
        <CardDescription>
          Sign in to continue to {appName}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>                     // react-hook-form + zod resolver
          {formError && <FormBanner message={formError} />}
          <FormField name=\"email\">
            <FormItem>
              <FormLabel>Email address</FormLabel>
              <FormControl>
                <Input
                  type=\"email\"
                  placeholder=\"you@example.com\"
                  autoComplete=\"email\"
                  autoFocus
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
          <FormField name=\"password\">
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <PasswordInput                // custom wrapper around Input
                  autoComplete=\"current-password\"
                  autoHideAfterMs={10000}     // FR1 AC7: revert to hidden after 10s
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
          <div className=\"flex justify-end\">
            <Link href=\"/forgot-password\" className=\"text-sm text-primary hover:underline\">
              Forgot password?
            </Link>
          </div>
          <Button
            type=\"submit\"
            className=\"w-full\"
            disabled={isSubmitting || isThrottled}
          >
            {isSubmitting ? (
              <>
                <Loader2 className=\"mr-2 h-4 w-4 animate-spin\" />
                Signing in...
              </>
            ) : 'Continue'}
          </Button>
        </Form>
        <Separator className=\"my-6\" />
        <div className=\"relative flex items-center justify-center\">
          <span className=\"bg-card px-2 text-xs text-muted-foreground\">
            or continue with
          </span>
        </div>
        <Button variant=\"outline\" className=\"w-full mt-4\" onClick={handleSSO}>
          <BuildingIcon className=\"mr-2 h-4 w-4\" />
          SSO / SAML
        </Button>
      </CardContent>
      <CardFooter className=\"flex-col gap-2\">
        <p className=\"text-sm text-muted-foreground\">
          Don't have an account?{' '}
          <Link href=\"/register\" className=\"text-primary hover:underline font-medium\">
            Sign up
          </Link>
        </p>
      </CardFooter>
    </Card>
    <LegalFooter />                          // HIPAA Notice . Privacy . Terms
  </AuthLayout>
</LoginPage>
```

**shadcn/ui Components with Exact Props:**

| Component | Props / Configuration |
|---|---|
| `Card` | `className=\"shadow-card border-0 max-w-sm w-full p-8 sm:p-6\"` |
| `CardTitle` | `className=\"font-heading text-3xl font-normal tracking-[-0.02em] leading-[1.2]\"` |
| `CardDescription` | `className=\"font-body text-sm text-muted-foreground\"` |
| `Form` | Uses `useForm<LoginFormValues>()` with `zodResolver(loginSchema)` |
| `FormField` | `control={form.control}`, `name=\"email\"` / `name=\"password\"` |
| `Input` (email) | `type=\"email\"`, `autoComplete=\"email\"`, `autoFocus`, `className=\"h-10\"` |
| `PasswordInput` | Custom component wrapping `Input` with `type` toggle, `autoComplete=\"current-password\"`, eye icon button with `aria-label=\"Show password\"` / `\"Hide password\"` |
| `Button` (primary) | `type=\"submit\"`, `variant=\"default\"` (terracotta bg), `className=\"w-full h-10\"`, `disabled={isSubmitting \\|\\| isThrottled}` |
| `Button` (SSO) | `variant=\"outline\"`, `className=\"w-full h-10\"` |
| `Separator` | default, wrapped in relative div with centered label text |
| `Link` (forgot pw) | `className=\"text-sm text-primary hover:underline\"` |
| `Link` (sign up) | `className=\"text-primary hover:underline font-medium\"` |

**Zod Form Schema:**

```typescript
import { z } from 'zod';

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'Email address is required')
    .email('Enter a valid email address')
    .transform((v) => v.toLowerCase().trim()),
  password: z
    .string()
    .min(1, 'Password is required'),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
```

**State Management:**

| State | Location | Purpose |
|---|---|---|
| `form` (react-hook-form) | Local component via `useForm()` | Field values, field-level validation errors, dirty/touched state |
| `isSubmitting` | Derived from `form.formState.isSubmitting` | Button loading state |
| `formError` | Local `useState<string \\| null>` | Banner error for server-returned auth failures |
| `isThrottled` | Local `useState<boolean>` | FR12 AC6: disable button for 2s after failure, 5s after 3 failures |
| `failureCount` | Local `useRef<number>` | Track consecutive failures in this browser session for progressive throttle |
| `passwordVisible` | Inside `PasswordInput` (`useState<boolean>`) | Eye toggle state |
| `autoHideTimer` | Inside `PasswordInput` (`useRef<NodeJS.Timeout>`) | 10-second auto-hide timer |

**Error States:**

| Error Condition | Display Type | Message |
|---|---|---|
| Field empty on submit | Inline (below field) | \"Email address is required\" / \"Password is required\" |
| Invalid email format | Inline (below field) | \"Enter a valid email address\" |
| Wrong credentials (401 from server) | Banner (above form) | \"Invalid email or password. Please try again.\" |
| Account locked (Keycloak `USER_TEMPORARILY_DISABLED`) | Redirect | Redirect to `/account-locked` |
| Server error (5xx) | Toast (Sonner) | \"Something went wrong. Please try again later.\" |
| Rate limited (429) | Toast (Sonner) | \"Too many requests. Please wait a moment and try again.\" |
| Network failure | Toast (Sonner) | \"Unable to connect. Check your internet connection and try again.\" |

**Loading States:**

| Trigger | Visual |
|---|---|
| Form submission | Button text changes to \"Signing in...\" with `Loader2` spinner icon (h-4 w-4 animate-spin). Button disabled. All inputs disabled via `fieldset[disabled]`. |
| SSO button click | SSO button shows `Loader2` spinner, text changes to \"Redirecting...\". All form inputs and primary button disabled. |

**Keyboard Shortcuts / Tab Order:**

1. Email input (autoFocus)
2. Password input
3. Password visibility toggle (eye icon)
4. \"Forgot password?\" link
5. \"Continue\" button
6. \"SSO / SAML\" button
7. \"Sign up\" link
8. Legal footer links

`Enter` key submits the form from any field within the `<form>` element. No custom keyboard shortcuts beyond native HTML form behavior.

---

### S2: Register (`/register`)

**Component Tree:**

```
<RegisterPage>
  <AuthLayout>
    <BrandHeader />
    <Card className=\"shadow-card border-0 max-w-sm w-full\">
      <CardHeader>
        <CardTitle>Create your account</CardTitle>
        <CardDescription>
          Sign up to access your health services
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          {formError && <FormBanner message={formError} />}
          <FormField name=\"fullName\">
            <FormItem>
              <FormLabel>Full name</FormLabel>
              <FormControl>
                <Input autoComplete=\"name\" autoFocus />
              </FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
          <FormField name=\"email\">
            <FormItem>
              <FormLabel>Email address</FormLabel>
              <FormControl>
                <Input type=\"email\" autoComplete=\"email\" />
              </FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
          <FormField name=\"password\">
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <PasswordInput autoComplete=\"new-password\" />
              </FormControl>
              <PasswordPolicyHelper password={watchedPassword} />
              <FormMessage />
            </FormItem>
          </FormField>
          <FormField name=\"confirmPassword\">
            <FormItem>
              <FormLabel>Confirm password</FormLabel>
              <FormControl>
                <PasswordInput autoComplete=\"new-password\" />
              </FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
          <FormField name=\"termsAccepted\">
            <FormItem className=\"flex items-start gap-2\">
              <FormControl>
                <Checkbox />
              </FormControl>
              <FormLabel className=\"text-sm font-normal leading-snug\">
                I agree to the{' '}
                <Link href=\"/terms\" className=\"text-primary hover:underline\">Terms of Service</Link>
                {' '}and{' '}
                <Link href=\"/privacy\" className=\"text-primary hover:underline\">Privacy Policy</Link>
              </FormLabel>
              <FormMessage />
            </FormItem>
          </FormField>
          <Button
            type=\"submit\"
            className=\"w-full\"
            disabled={isSubmitting || !form.formState.isValid}
          >
            {isSubmitting ? (
              <>
                <Loader2 className=\"mr-2 h-4 w-4 animate-spin\" />
                Creating account...
              </>
            ) : 'Create account'}
          </Button>
        </Form>
      </CardContent>
      <CardFooter>
        <p className=\"text-sm text-muted-foreground\">
          Already have an account?{' '}
          <Link href=\"/login\" className=\"text-primary hover:underline font-medium\">
            Sign in
          </Link>
        </p>
      </CardFooter>
    </Card>
    <LegalFooter />
  </AuthLayout>
</RegisterPage>
```

**Zod Form Schema:**

```typescript
export const registerSchema = z
  .object({
    fullName: z
      .string()
      .min(1, 'Full name is required')
      .min(2, 'Name must be at least 2 characters')
      .max(100, 'Name must be under 100 characters'),
    email: z
      .string()
      .min(1, 'Email address is required')
      .email('Enter a valid email address')
      .transform((v) => v.toLowerCase().trim()),
    password: z
      .string()
      .min(12, 'Password must be at least 12 characters')
      .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Must contain at least one number')
      .regex(
        /[!@#$%^&*()\\-_=+\\[\\]{};:'\",.<>?/\\\\|~]/,
        'Must contain at least one special character'
      ),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
    termsAccepted: z.literal(true, {
      errorMap: () => ({ message: 'You must accept the Terms of Service' }),
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type RegisterFormValues = z.infer<typeof registerSchema>;
```

**`PasswordPolicyHelper` Sub-component:**

This renders below the password field as a checklist of requirements, each turning from `text-muted-foreground` to `text-green-600 dark:text-green-400` with a checkmark icon as the user types:

```
<PasswordPolicyHelper> renders:
  [ ] / [x] At least 12 characters
  [ ] / [x] One uppercase letter
  [ ] / [x] One lowercase letter
  [ ] / [x] One number
  [ ] / [x] One special character
```

Each line is `text-xs` and toggles `text-muted-foreground` (unmet) vs `text-green-600` (met). Uses `aria-live=\"polite\"` on the container so screen readers announce changes as the user types.

**State Management:**

| State | Location | Purpose |
|---|---|---|
| `form` (react-hook-form) | Local `useForm()` with `mode: 'onBlur'` | Field values, validation per FR2 AC5 (validate on blur) |
| `formError` | Local `useState<string \\| null>` | Server-returned registration errors |
| `isSubmitting` | Derived from `form.formState.isSubmitting` | Loading state |
| `watchedPassword` | `form.watch('password')` | Drives real-time `PasswordPolicyHelper` updates |

**Error States:**

| Error Condition | Display Type | Message |
|---|---|---|
| Field empty on blur | Inline | \"Full name is required\" / \"Email address is required\" etc. |
| Password policy violation | Inline + PasswordPolicyHelper | Specific unmet rule highlighted in helper |
| Passwords don't match | Inline (below confirm password) | \"Passwords do not match\" |
| Terms not checked | Inline (below checkbox) | \"You must accept the Terms of Service\" |
| Email already registered (server) | Banner | \"Unable to create account. Please try again or sign in.\" |
| Server error | Toast | \"Something went wrong. Please try again later.\" |

**Loading States:**

Button changes to \"Creating account...\" with spinner. All inputs disabled. After success, a brief \"Redirecting...\" state before navigation to `/login/mfa-setup`.

**Tab Order:**

1. Full name input (autoFocus)
2. Email input
3. Password input
4. Password visibility toggle
5. Confirm password input
6. Confirm password visibility toggle
7. Terms of Service checkbox
8. Terms of Service link
9. Privacy Policy link
10. \"Create account\" button
11. \"Sign in\" link

---

### S3: MFA Challenge (`/login/mfa`)

**Component Tree:**

```
<MFAChallengePage>
  <AuthLayout>
    <BrandHeader />
    <Card className=\"shadow-card border-0 max-w-sm w-full\">
      <CardHeader>
        <CardTitle>Two-factor authentication</CardTitle>
        <CardDescription>
          Enter the 6-digit code from your authenticator app.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          {formError && <FormBanner message={formError} />}
          <FormField name=\"code\">
            <FormItem className=\"flex flex-col items-center\">
              <FormControl>
                <InputOTP
                  maxLength={6}
                  pattern={REGEXP_ONLY_DIGITS}
                  autoFocus
                  onComplete={handleAutoSubmit}
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                  </InputOTPGroup>
                  <InputOTPSeparator />
                  <InputOTPGroup>
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
          <Button
            type=\"submit\"
            className=\"w-full\"
            disabled={isSubmitting || code.length < 6}
          >
            {isSubmitting ? (
              <>
                <Loader2 className=\"mr-2 h-4 w-4 animate-spin\" />
                Verifying...
              </>
            ) : 'Verify'}
          </Button>
        </Form>
      </CardContent>
      <CardFooter className=\"flex-col gap-3\">
        <Link
          href=\"/login/mfa-recovery\"
          className=\"text-sm text-muted-foreground hover:text-primary\"
        >
          Can't access your code? Use a recovery code
        </Link>
        <Link
          href=\"/login\"
          className=\"text-sm text-muted-foreground hover:text-primary flex items-center gap-1\"
        >
          <ArrowLeft className=\"h-3 w-3\" /> Back to sign in
        </Link>
      </CardFooter>
    </Card>
  </AuthLayout>
</MFAChallengePage>
```

**shadcn/ui InputOTP Configuration:**

| Prop | Value | Purpose |
|---|---|---|
| `maxLength` | `6` | 6-digit TOTP |
| `pattern` | `REGEXP_ONLY_DIGITS` (from `input-otp`) | Restricts to numeric input |
| `autoFocus` | `true` | First slot receives focus on mount |
| `onComplete` | `handleAutoSubmit` callback | FR5 AC3: auto-submit when 6th digit entered |
| Each `InputOTPSlot` | `className=\"h-12 w-12 text-lg\"` | 48x48px slots, exceeding 44px touch target |

**Zod Form Schema:**

```typescript
export const mfaChallengeSchema = z.object({
  code: z
    .string()
    .length(6, 'Enter all 6 digits')
    .regex(/^\\d{6}$/, 'Code must be 6 digits'),
});

export type MFAChallengeFormValues = z.infer<typeof mfaChallengeSchema>;
```

**State Management:**

| State | Location | Purpose |
|---|---|---|
| `form` | Local `useForm()` | OTP value |
| `formError` | Local `useState<string \\| null>` | \"Unable to verify. Please try again.\" |
| `isSubmitting` | Derived from form state | Loading |
| `attemptCount` | Local `useRef<number>` | Track failures; at 5 redirect to `/account-locked` |

**Auto-Submit Behavior:**

```typescript
const handleAutoSubmit = useCallback(async (value: string) => {
  if (value.length === 6) {
    form.setValue('code', value);
    await form.handleSubmit(onSubmit)();
  }
}, [form, onSubmit]);
```

On failure, the `InputOTP` value is cleared programmatically via `form.reset({ code: '' })`, and focus returns to the first slot. This is accomplished by holding a ref to the `InputOTP` component and calling `.focus()` on the first slot after reset.

**Error States:**

| Error Condition | Display Type | Message |
|---|---|---|
| Wrong code | Banner + OTP clear | \"Unable to verify. Please try again.\" |
| 5th consecutive failure | Redirect | Redirect to `/account-locked` |
| Server error | Toast | \"Something went wrong. Please try again later.\" |

**Loading States:**

Button shows \"Verifying...\" with spinner. OTP inputs become disabled. On auto-submit, the visual feedback is immediate: all 6 slots lock (slight opacity reduction) and the spinner appears.

**Tab Order:**

1. OTP slot 1 (autoFocus; slots auto-advance, not separate tab stops)
2. \"Verify\" button
3. \"Use a recovery code\" link
4. \"Back to sign in\" link

---

### S4: MFA Setup (`/login/mfa-setup`)

**Component Tree (two phases -- Setup and Recovery Codes):**

**Phase 1: QR Code + Verification**

```
<MFASetupPage>
  <AuthLayout>
    <BrandHeader />
    <Card className=\"shadow-card border-0 max-w-[28rem] w-full\">
      <CardHeader>
        <CardTitle>Set up two-factor authentication</CardTitle>
        <CardDescription>
          Scan this QR code with your authenticator app
          (Google Authenticator, Authy, or similar).
        </CardDescription>
      </CardHeader>
      <CardContent className=\"flex flex-col items-center gap-6\">
        <div className=\"rounded-lg border p-4 bg-white\">
          <QRCodeImage
            src={qrCodeDataUrl}
            alt=\"TOTP QR code for authenticator app\"
            width={200}
            height={200}
          />
        </div>
        <ManualKeyToggle>
          <p className=\"text-sm text-muted-foreground\">
            Can't scan? Enter this code manually:
          </p>
          <code className=\"font-mono text-sm tracking-wider select-all bg-muted px-3 py-2 rounded-md\">
            {formattedSecret}   {/* e.g. \"JBSW Y3DP EHPK 3PXP\" */}
          </code>
          <Button
            variant=\"ghost\"
            size=\"sm\"
            onClick={copySecretToClipboard}
          >
            <Copy className=\"h-3.5 w-3.5 mr-1\" /> Copy
          </Button>
        </ManualKeyToggle>
        <div className=\"w-full\">
          <p className=\"text-sm text-muted-foreground mb-3\">
            Enter the 6-digit code to verify setup:
          </p>
          <Form {...form}>
            <FormField name=\"code\">
              <FormItem className=\"flex flex-col items-center\">
                <FormControl>
                  <InputOTP maxLength={6} pattern={REGEXP_ONLY_DIGITS} onComplete={handleAutoSubmit}>
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                    </InputOTPGroup>
                    <InputOTPSeparator />
                    <InputOTPGroup>
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </FormControl>
                <FormMessage />
              </FormItem>
            </FormField>
            <Button type=\"submit\" className=\"w-full mt-4\" disabled={isSubmitting}>
              {isSubmitting ? (
                <><Loader2 className=\"mr-2 h-4 w-4 animate-spin\" /> Verifying...</>
              ) : 'Verify and enable'}
            </Button>
          </Form>
        </div>
      </CardContent>
    </Card>
  </AuthLayout>
</MFASetupPage>
```

**Phase 2: Recovery Codes (shown after successful verification)**

```
<RecoveryCodesView>
  <Card className=\"shadow-card border-0 max-w-[28rem] w-full\">
    <CardHeader>
      <CardTitle>Save your recovery codes</CardTitle>
      <CardDescription>
        If you lose access to your authenticator app, you can use
        these codes to sign in. Each code can only be used once.
      </CardDescription>
    </CardHeader>
    <CardContent>
      <div className=\"rounded-md border bg-muted/50 p-4 font-mono text-sm space-y-1\">
        {recoveryCodes.map((code) => (
          <div key={code}>{code}</div>  // e.g. \"a1b2c-3d4e5\"
        ))}
      </div>
      <div className=\"flex gap-3 mt-4\">
        <Button variant=\"outline\" size=\"sm\" onClick={copyAllCodes}>
          <Copy className=\"h-3.5 w-3.5 mr-1\" /> Copy
        </Button>
        <Button variant=\"outline\" size=\"sm\" onClick={downloadCodes}>
          <Download className=\"h-3.5 w-3.5 mr-1\" /> Download
        </Button>
      </div>
      <FormField name=\"savedConfirmation\">
        <FormItem className=\"flex items-start gap-2 mt-6\">
          <FormControl>
            <Checkbox />
          </FormControl>
          <FormLabel className=\"text-sm font-normal\">
            I've saved these codes
          </FormLabel>
        </FormItem>
      </FormField>
      <Button
        className=\"w-full mt-4\"
        disabled={!savedConfirmed}
        onClick={handleContinue}
      >
        Continue
      </Button>
    </CardContent>
  </Card>
</RecoveryCodesView>
```

**State Management:**

| State | Location | Purpose |
|---|---|---|
| `phase` | Local `useState<'setup' \\| 'recovery'>` | Controls which view is shown |
| `qrCodeDataUrl` | Server data (fetched on mount) | Base64-encoded QR image from Keycloak TOTP setup API |
| `totpSecret` | Server data | Base32 secret string for manual entry |
| `recoveryCodes` | Server response (after verification) | Array of 5 recovery code strings |
| `savedConfirmed` | Local `useState<boolean>` | Checkbox state; gates \"Continue\" button |
| `manualKeyVisible` | Local `useState<boolean>` | Toggle for \"Can't scan?\" collapsible |

**Tab Order (Phase 1):**

1. QR code area (not interactive, skipped)
2. \"Can't scan?\" toggle button
3. Manual key copy button (when expanded)
4. OTP slot 1 (auto-advance through 6)
5. \"Verify and enable\" button

**Tab Order (Phase 2):**

1. \"Copy\" button
2. \"Download\" button
3. \"I've saved these codes\" checkbox
4. \"Continue\" button

---

### S5: Forgot Password (`/forgot-password`)

**Component Tree:**

```
<ForgotPasswordPage>
  <AuthLayout>
    <BrandHeader />
    <Card className=\"shadow-card border-0 max-w-sm w-full\">
      <CardHeader>
        <CardTitle>Reset your password</CardTitle>
        <CardDescription>
          Enter the email address associated with your account
          and we'll send you a link to reset your password.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!isSubmitted ? (
          <Form {...form}>
            <FormField name=\"email\">
              <FormItem>
                <FormLabel>Email address</FormLabel>
                <FormControl>
                  <Input type=\"email\" autoComplete=\"email\" autoFocus />
                </FormControl>
                <FormMessage />
              </FormItem>
            </FormField>
            <Button type=\"submit\" className=\"w-full\" disabled={isSubmitting}>
              {isSubmitting ? (
                <><Loader2 className=\"mr-2 h-4 w-4 animate-spin\" /> Sending...</>
              ) : 'Send reset link'}
            </Button>
          </Form>
        ) : (
          <ConfirmationMessage>
            <CheckCircle className=\"h-8 w-8 text-primary mx-auto mb-3\" />
            <p className=\"text-sm text-center text-muted-foreground\">
              If an account exists with that email, you'll receive
              a password reset link shortly.
            </p>
            <p className=\"text-xs text-center text-muted-foreground mt-2\">
              Check your spam folder if you don't see it.
            </p>
          </ConfirmationMessage>
        )}
      </CardContent>
      <CardFooter>
        <Link href=\"/login\" className=\"text-sm text-muted-foreground hover:text-primary flex items-center gap-1\">
          <ArrowLeft className=\"h-3 w-3\" /> Back to sign in
        </Link>
      </CardFooter>
    </Card>
  </AuthLayout>
</ForgotPasswordPage>
```

**Zod Schema:**

```typescript
export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .min(1, 'Email address is required')
    .email('Enter a valid email address')
    .transform((v) => v.toLowerCase().trim()),
});
```

**State Management:**

| State | Location | Purpose |
|---|---|---|
| `form` | Local `useForm()` | Email field value |
| `isSubmitted` | Local `useState<boolean>` | Toggles between form view and confirmation view |
| `isSubmitting` | Derived from form | Loading state |

**Critical UX Decision:** The confirmation message is ALWAYS shown after submission, regardless of whether the email exists. Per FR10 AC2 and FR20, this prevents email enumeration. No error banner is ever shown for \"email not found.\"

**Error States:**

| Error Condition | Display Type | Message |
|---|---|---|
| Empty email | Inline | \"Email address is required\" |
| Invalid email format | Inline | \"Enter a valid email address\" |
| Server error (5xx) | Toast | \"Something went wrong. Please try again later.\" |
| Rate limited (silent) | No error shown | Silently dropped per FR10 AC8 |

---

### S6: Reset Password (`/reset-password?token={token}`)

**Component Tree:**

```
<ResetPasswordPage>
  <AuthLayout>
    <BrandHeader />
    <Card className=\"shadow-card border-0 max-w-sm w-full\">
      {tokenValid ? (
        <>
          <CardHeader>
            <CardTitle>Create a new password</CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              {formError && <FormBanner message={formError} />}
              <FormField name=\"password\">
                <FormItem>
                  <FormLabel>New password</FormLabel>
                  <FormControl>
                    <PasswordInput autoComplete=\"new-password\" autoFocus />
                  </FormControl>
                  <PasswordPolicyHelper password={watchedPassword} />
                  <FormMessage />
                </FormItem>
              </FormField>
              <FormField name=\"confirmPassword\">
                <FormItem>
                  <FormLabel>Confirm new password</FormLabel>
                  <FormControl>
                    <PasswordInput autoComplete=\"new-password\" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              </FormField>
              <Button type=\"submit\" className=\"w-full\" disabled={isSubmitting}>
                {isSubmitting ? (
                  <><Loader2 className=\"mr-2 h-4 w-4 animate-spin\" /> Resetting...</>
                ) : 'Reset password'}
              </Button>
            </Form>
          </CardContent>
        </>
      ) : (
        <>
          <CardHeader>
            <CardTitle>Link expired</CardTitle>
          </CardHeader>
          <CardContent>
            <p className=\"text-sm text-muted-foreground\">
              This reset link has expired or has already been used.
              Please request a new one.
            </p>
            <Button asChild variant=\"outline\" className=\"w-full mt-4\">
              <Link href=\"/forgot-password\">Request new link</Link>
            </Button>
          </CardContent>
        </>
      )}
    </Card>
  </AuthLayout>
</ResetPasswordPage>
```

**Zod Schema:**

```typescript
export const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(12, 'Password must be at least 12 characters')
      .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Must contain at least one number')
      .regex(
        /[!@#$%^&*()\\-_=+\\[\\]{};:'\",.<>?/\\\\|~]/,
        'Must contain at least one special character'
      ),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });
```

**State Management:**

| State | Location | Purpose |
|---|---|---|
| `tokenValid` | Server-side validated (passed as prop or fetched on mount) | Determines which view to show |
| `form` | Local `useForm()` | Password fields |
| `formError` | Local `useState<string \\| null>` | Server-side password policy violations (breach list, personal data check) |

**Post-Success:** Redirect to `/login` with a Sonner toast: \"Password updated. Please sign in with your new password.\"

---

### S7: Session Timeout Warning (Modal Overlay)

**Component Tree:**

```
<SessionTimeoutWarning>
  <AlertDialog open={isVisible} onOpenChange={() => {}}>  {/* not dismissable */}
    <AlertDialogContent
      className=\"max-w-sm\"
      onEscapeKeyDown={(e) => e.preventDefault()}      {/* block Escape */}
      onPointerDownOutside={(e) => e.preventDefault()}  {/* block outside click */}
    >
      <AlertDialogHeader>
        <AlertDialogTitle>Session expiring</AlertDialogTitle>
        <AlertDialogDescription>
          You'll be automatically signed out in{' '}
          <span className=\"font-semibold tabular-nums\" aria-live=\"assertive\" role=\"timer\">
            {formatTime(secondsRemaining)}
          </span>
          {' '}due to inactivity.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel onClick={handleSignOut}>
          Sign out
        </AlertDialogCancel>
        <AlertDialogAction onClick={handleStayIn} autoFocus>
          Stay in
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</SessionTimeoutWarning>
```

**Critical AlertDialog Props:**

- `open={isVisible}` -- controlled by session timer logic
- `onOpenChange` is a no-op function -- prevents the dialog from being closed by any built-in mechanism
- `onEscapeKeyDown` calls `preventDefault()` -- blocks Escape key dismissal (FR7 AC5)
- `onPointerDownOutside` calls `preventDefault()` -- blocks click-outside dismissal (FR7 AC5)
- `AlertDialogAction` (\"Stay in\") has `autoFocus` -- focused by default per accessibility best practice (primary safe action)

**State Management:**

| State | Location | Purpose |
|---|---|---|
| `isVisible` | `SessionProvider` context (or `useSession()` hook) | Controlled by idle timer reaching 2-minute threshold |
| `secondsRemaining` | Local `useState<number>`, decremented via `setInterval(1000)` | Live countdown |
| `idleTimerRef` | `useRef` inside `SessionProvider` | Tracks last activity timestamp |

**Timer Logic (inside `SessionProvider`):**

```typescript
// Simplified logic outline
const IDLE_TIMEOUT_MS = 15 * 60 * 1000;       // 15 minutes
const WARNING_LEAD_MS = 2 * 60 * 1000;        // 2 minutes before
const TIMER_OFFSET_MS = 5 * 1000;             // 5s ahead of server (EC5)

// Activity listener resets lastActivity on mouse, keyboard, touch, scroll
// Check every second:
// - If (now - lastActivity) >= (IDLE_TIMEOUT_MS - WARNING_LEAD_MS - TIMER_OFFSET_MS):
//     show warning, start countdown
// - If countdown reaches 0: auto-logout

// Multi-tab sync via BroadcastChannel:
const channel = new BroadcastChannel('healthgate-session');
channel.onmessage = (event) => {
  if (event.data.type === 'SESSION_EXTENDED') resetIdleTimer();
  if (event.data.type === 'SESSION_EXPIRED') performLogout();
};
```

**Error States:**

| Error Condition | Display Type | Message |
|---|---|---|
| \"Stay in\" fails (server session already expired) | Redirect | Redirect to `/session-expired` |
| Network error on \"Stay in\" | Toast + retry | Toast: \"Unable to extend session. Retrying...\" Auto-retry once. On second failure: redirect to `/session-expired` |

---

### S8: Session Expired (`/session-expired`)

**Component Tree:**

```
<SessionExpiredPage>
  <AuthLayout>
    <BrandHeader />
    <Card className=\"shadow-card border-0 max-w-sm w-full\">
      <CardHeader className=\"items-center\">
        <Clock className=\"h-10 w-10 text-muted-foreground mb-2\" />
        <CardTitle>Your session has ended</CardTitle>
        <CardDescription className=\"text-center\">
          {reason === 'idle'
            ? 'For your security, you were automatically signed out due to inactivity.'
            : 'Please sign in again.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild className=\"w-full\">
          <Link href={`/login${redirectUri ? `?redirect=${encodeURIComponent(redirectUri)}` : ''}`}>
            Sign in again
          </Link>
        </Button>
      </CardContent>
    </Card>
  </AuthLayout>
</SessionExpiredPage>
```

**State Management:**

Minimal. `reason` and `redirectUri` are derived from URL search params set during the logout redirect. No form state.

---

### S9: Dashboard (`/dashboard`) -- Protected

**Component Tree:**

```
<ProtectedRoute>
  <DashboardLayout>
    <header className=\"flex items-center justify-between p-4 border-b\">
      <BrandHeader variant=\"compact\" />
      <UserMenu />                          // Dropdown: name, email, role, \"Sign out\"
    </header>
    <main className=\"p-8\">
      <h1 className=\"font-heading text-2xl\">Dashboard</h1>
      <p className=\"text-muted-foreground mt-2\">
        You're signed in as {user.name}.
      </p>
      {/* Placeholder content for V1 */}
    </main>
    <SessionTimeoutWarning />               // Always mounted when authenticated
    <Toaster />                             // Sonner toast container
  </DashboardLayout>
</ProtectedRoute>
```

**`UserMenu` Sub-component:**

```
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant=\"ghost\" className=\"flex items-center gap-2\">
      <Avatar className=\"h-8 w-8\">
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>
      <span className=\"text-sm hidden sm:inline\">{user.name}</span>
      <ChevronDown className=\"h-4 w-4\" />
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align=\"end\">
    <DropdownMenuLabel>
      <div>{user.name}</div>
      <div className=\"text-xs text-muted-foreground\">{user.email}</div>
    </DropdownMenuLabel>
    <DropdownMenuSeparator />
    <DropdownMenuItem onClick={handleSignOut}>
      <LogOut className=\"mr-2 h-4 w-4\" /> Sign out
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

---

### S10: Account Locked (`/account-locked`)

**Component Tree:**

```
<AccountLockedPage>
  <AuthLayout>
    <BrandHeader />
    <Card className=\"shadow-card border-0 max-w-sm w-full\">
      <CardHeader className=\"items-center\">
        <ShieldAlert className=\"h-10 w-10 text-destructive mb-2\" />
        <CardTitle>Account temporarily locked</CardTitle>
        <CardDescription className=\"text-center\">
          For your security, this account has been locked after
          multiple failed sign-in attempts.
        </CardDescription>
      </CardHeader>
      <CardContent className=\"space-y-4\">
        <p className=\"text-sm text-muted-foreground text-center\">
          Try again in 15 minutes, or reset your password.
        </p>
        <Button asChild className=\"w-full\">
          <Link href=\"/forgot-password\">Reset password</Link>
        </Button>
      </CardContent>
      <CardFooter>
        <Link href=\"/login\" className=\"text-sm text-muted-foreground hover:text-primary flex items-center gap-1\">
          <ArrowLeft className=\"h-3 w-3\" /> Back to sign in
        </Link>
      </CardFooter>
    </Card>
  </AuthLayout>
</AccountLockedPage>
```

**Note:** Per FR12 AC3, the message intentionally does NOT say \"after 5 failed attempts\" to avoid confirming the exact threshold to attackers.

---

## 2. Keycloak <-> UI Flow Mapping

### 2a. Login Flow (OIDC Authorization Code + PKCE)

**Step-by-step sequence:**

```
User Browser                  Next.js BFF                     Keycloak
    |                              |                              |
    |  1. GET /login               |                              |
    |  <--- render login form -----|                              |
    |                              |                              |
    |  2. POST /api/auth/login     |                              |
    |     { email, password }      |                              |
    |  --------------------------->|                              |
    |                              |  3. Generate PKCE:           |
    |                              |     code_verifier (random)   |
    |                              |     code_challenge =         |
    |                              |       SHA256(code_verifier)  |
    |                              |                              |
    |                              |  4. Store code_verifier in   |
    |                              |     HttpOnly cookie (5min)   |
    |                              |                              |
    |                              |  5. POST /realms/{realm}/    |
    |                              |     protocol/openid-connect/ |
    |                              |     auth                     |
    |                              |     ?response_type=code      |
    |                              |     &client_id={client}      |
    |                              |     &redirect_uri={callback} |
    |                              |     &scope=openid profile    |
    |                              |     &state={csrf_state}      |
    |                              |     &code_challenge={hash}   |
    |                              |     &code_challenge_method=  |
    |                              |       S256                   |
    |                              |  --------------------------->|
    |                              |                              |
    |                              |     (Keycloak validates      |
    |                              |      credentials internally) |
    |                              |                              |
    |                              |  6a. If MFA required:        |
    |                              |  <-- 302 to Keycloak MFA ----|
    |  <-- redirect to /login/mfa -|  (or Next.js detects         |
    |                              |   required_action in         |
    |                              |   response and renders MFA)  |
    |                              |                              |
    |                              |  6b. If no MFA / MFA passed: |
    |                              |  <-- 302 + auth code --------|
    |                              |                              |
    |                              |  7. POST /realms/{realm}/    |
    |                              |     protocol/openid-connect/ |
    |                              |     token                    |
    |                              |     grant_type=              |
    |                              |       authorization_code     |
    |                              |     code={auth_code}         |
    |                              |     code_verifier=           |
    |                              |       {from_cookie}          |
    |                              |     redirect_uri={callback}  |
    |                              |     client_id={client}       |
    |                              |     client_secret={secret}   |
    |                              |  --------------------------->|
    |                              |                              |
    |                              |  <-- { access_token,       --|
    |                              |        refresh_token,        |
    |                              |        id_token }            |
    |                              |                              |
    |                              |  8. Set encrypted HttpOnly   |
    |                              |     cookies:                 |
    |                              |     hg-access (5min MaxAge)  |
    |                              |     hg-refresh (8h/30m)      |
    |                              |     hg-id (session)          |
    |                              |     Clear PKCE cookie        |
    |                              |                              |
    |  9. 302 to /dashboard        |                              |
    |  <--- (or redirect_uri) -----|                              |
    |                              |                              |
```

**Exact Keycloak Endpoints:**

| Step | Endpoint | Method | Purpose |
|---|---|---|---|
| 5 | `{keycloakUrl}/realms/{realm}/protocol/openid-connect/auth` | GET (redirect) | Initiate OIDC auth |
| 7 | `{keycloakUrl}/realms/{realm}/protocol/openid-connect/token` | POST | Exchange code for tokens |
| (discovery) | `{keycloakUrl}/realms/{realm}/.well-known/openid-configuration` | GET | Discover all endpoint URLs |

**Token Exchange Request Payload (Step 7):**

```
POST /realms/healthgate-clinician/protocol/openid-connect/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=abc123...
&redirect_uri=https://auth.googlehealth.com/api/auth/callback
&client_id=healthgate-web
&client_secret=xxxx
&code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk
```

**Token Exchange Response (Step 7):**

```json
{
  \"access_token\": \"eyJhbG...\",
  \"refresh_token\": \"eyJhbG...\",
  \"id_token\": \"eyJhbG...\",
  \"token_type\": \"Bearer\",
  \"expires_in\": 300,
  \"refresh_expires_in\": 28800,
  \"session_state\": \"uuid-of-keycloak-session\",
  \"scope\": \"openid profile email\"
}
```

**What the User Sees at Each Step:**

| Step | User Experience |
|---|---|
| 1 | Login form renders (< 500ms p50) |
| 2 | Clicks \"Continue\" -- button shows \"Signing in...\" spinner |
| 3-5 | No visible change; all server-side |
| 6a | If MFA: redirected to MFA challenge screen (new page load, < 300ms) |
| 6b | If no MFA: brief spinner continues |
| 7-8 | No visible change; token exchange is back-channel |
| 9 | Redirected to dashboard; spinner resolves |

**Key Architectural Decision:** We use the \"BFF pattern\" (Backend for Frontend). The browser NEVER receives raw tokens. The Next.js API route (running server-side) performs the token exchange and sets encrypted HttpOnly cookies. This means the OIDC flow is NOT a pure client-side SPA redirect -- it is a server-mediated flow where `POST /api/auth/login` initiates the process and `GET /api/auth/callback` receives the authorization code.

---

### 2b. Registration Flow

**Step-by-step sequence:**

```
User Browser                  Next.js BFF                     Keycloak Admin API
    |                              |                              |
    |  1. GET /register            |                              |
    |  <--- render register form --|                              |
    |                              |                              |
    |  2. POST /api/auth/register  |                              |
    |     { fullName, email,       |                              |
    |       password }             |                              |
    |  --------------------------->|                              |
    |                              |  3. POST /admin/realms/      |
    |                              |     {realm}/users             |
    |                              |     Authorization: Bearer     |
    |                              |       {service_account_token} |
    |                              |                              |
    |                              |     {                        |
    |                              |       \"firstName\": \"Maria\",  |
    |                              |       \"lastName\": \"Rodriguez\"|
    |                              |       \"email\": \"maria@...\",  |
    |                              |       \"enabled\": true,       |
    |                              |       \"emailVerified\": true, |
    |                              |       \"credentials\": [{      |
    |                              |         \"type\": \"password\",  |
    |                              |         \"value\": \"...\",      |
    |                              |         \"temporary\": false   |
    |                              |       }],                    |
    |                              |       \"requiredActions\": [   |
    |                              |         \"CONFIGURE_TOTP\"     |
    |                              |       ]                      |
    |                              |     }                        |
    |                              |  --------------------------->|
    |                              |                              |
    |                              |  <-- 201 Created             |
    |                              |     Location: /users/{uuid}  |
    |                              |                              |
    |                              |  4. Initiate OIDC login flow |
    |                              |     (same as login step 5-8) |
    |                              |     with the new user creds  |
    |                              |  --------------------------->|
    |                              |                              |
    |                              |  <-- Keycloak returns token  |
    |                              |     but with required_action |
    |                              |     CONFIGURE_TOTP           |
    |                              |                              |
    |  5. 302 to /login/mfa-setup  |                              |
    |  <--- redirect --------------|                              |
    |                              |                              |
```

**Exact Keycloak Endpoints:**

| Step | Endpoint | Method |
|---|---|---|
| 3 | `{keycloakUrl}/admin/realms/{realm}/users` | POST |
| 4 | Standard OIDC flow (see Login Flow steps 5-8) | GET/POST |

**Request Payload (Step 3):**

```json
{
  \"firstName\": \"Maria\",
  \"lastName\": \"Rodriguez\",
  \"email\": \"maria@example.com\",
  \"username\": \"maria@example.com\",
  \"enabled\": true,
  \"emailVerified\": false,
  \"credentials\": [
    {
      \"type\": \"password\",
      \"value\": \"SecurePass123!\",
      \"temporary\": false
    }
  ],
  \"requiredActions\": [\"CONFIGURE_TOTP\"]
}
```

**Error Response (409 Conflict -- email exists):**

```json
{
  \"errorMessage\": \"User exists with same username\"
}
```

The BFF intercepts this and returns a generic message to the browser: \"Unable to create account. Please try again or sign in.\"

**What the User Sees:**

| Step | User Experience |
|---|---|
| 1 | Registration form renders |
| 2 | Clicks \"Create account\" -- button shows \"Creating account...\" spinner |
| 3-4 | Server-side; no visible change |
| 5 | Redirected to MFA setup screen with QR code |

---

### 2c. MFA Challenge Flow

**Step-by-step sequence:**

There are two implementation approaches for MFA with Keycloak. Since we are using the BFF pattern and want full control over the UI, we use Keycloak's **Authentication SPI with a custom REST endpoint** rather than Keycloak's hosted login pages.

```
User Browser                  Next.js BFF                     Keycloak
    |                              |                              |
    |  (After login step 6a:       |                              |
    |   BFF detected               |                              |
    |   required_action or         |                              |
    |   OTP_CREDENTIAL needed)     |                              |
    |                              |                              |
    |  1. GET /login/mfa           |                              |
    |  <--- render MFA form -------|                              |
    |     (session token stored    |                              |
    |      in HttpOnly cookie      |                              |
    |      hg-mfa-session)         |                              |
    |                              |                              |
    |  2. POST /api/auth/mfa       |                              |
    |     { code: \"123456\" }       |                              |
    |  --------------------------->|                              |
    |                              |  3. POST /realms/{realm}/    |
    |                              |     protocol/openid-connect/ |
    |                              |     token                    |
    |                              |     grant_type=password      |
    |                              |     (with OTP credential)    |
    |                              |                              |
    |                              |     OR via Keycloak's        |
    |                              |     Authentication Flow API: |
    |                              |     POST /realms/{realm}/    |
    |                              |     login-actions/           |
    |                              |     authenticate             |
    |                              |     ?session_code={code}     |
    |                              |     &execution={otp_exec_id} |
    |                              |     &client_id={client}      |
    |                              |                              |
    |                              |     Body: { otp: \"123456\" }  |
    |                              |  --------------------------->|
    |                              |                              |
    |                              |  4a. Valid code:             |
    |                              |  <-- tokens issued ----------|
    |                              |                              |
    |                              |  4b. Invalid code:           |
    |                              |  <-- 401 invalid_otp --------|
    |                              |                              |
    |  5a. 302 to /dashboard       |                              |
    |  <--- (set token cookies) ---|                              |
    |                              |                              |
    |  5b. Re-render with error    |                              |
    |  <--- \"Unable to verify...\" -|                              |
    |                              |                              |
```

**What the User Sees:**

| Step | User Experience |
|---|---|
| 1 | MFA challenge form with 6 OTP input boxes |
| 2 | User enters digits; on 6th digit, form auto-submits. Boxes lock, spinner appears |
| 4a | Brief \"Verifying...\" then redirect to dashboard |
| 4b | Error banner \"Unable to verify. Please try again.\" OTP cleared, focus returns to first digit |

---

### 2d. Password Reset Flow

**Step-by-step sequence:**

```
User Browser                  Next.js BFF                     Keycloak
    |                              |                              |
    |  1. GET /forgot-password     |                              |
    |  <--- render form ---------- |                              |
    |                              |                              |
    |  2. POST /api/auth/          |                              |
    |     forgot-password          |                              |
    |     { email }                |                              |
    |  --------------------------->|                              |
    |                              |  3. PUT /admin/realms/       |
    |                              |     {realm}/users/{id}/      |
    |                              |     execute-actions-email    |
    |                              |                              |
    |                              |     Body: [\"UPDATE_PASSWORD\"]|
    |                              |     Query: ?lifespan=900     |
    |                              |       (15 min in seconds)    |
    |                              |                              |
    |                              |     Note: BFF first looks up |
    |                              |     user by email via:       |
    |                              |     GET /admin/realms/       |
    |                              |     {realm}/users            |
    |                              |     ?email={email}&exact=true|
    |                              |                              |
    |                              |     If user not found: BFF   |
    |                              |     returns success anyway   |
    |                              |     (prevent enumeration)    |
    |                              |  --------------------------->|
    |                              |                              |
    |                              |  <-- 204 No Content ---------|
    |                              |     (Keycloak sends email)   |
    |                              |                              |
    |  4. Show confirmation        |                              |
    |  <--- \"If an account...\" ----|                              |
    |                              |                              |
    |  === USER CHECKS EMAIL ===   |                              |
    |                              |                              |
    |  5. Clicks link in email:    |                              |
    |     https://auth.google      |                              |
    |     health.com/reset-        |                              |
    |     password?token={kc_token}|                              |
    |  --------------------------->|                              |
    |                              |  6. Validate token:          |
    |                              |     GET /realms/{realm}/     |
    |                              |     login-actions/           |
    |                              |     action-token?key={token} |
    |                              |  --------------------------->|
    |                              |  <-- token valid/invalid ----|
    |                              |                              |
    |  7a. Token valid:            |                              |
    |  <--- render reset form -----|                              |
    |                              |                              |
    |  7b. Token invalid/expired:  |                              |
    |  <--- render expired view ---|                              |
    |                              |                              |
    |  8. POST /api/auth/          |                              |
    |     reset-password           |                              |
    |     { token, newPassword }   |                              |
    |  --------------------------->|                              |
    |                              |  9. POST token endpoint      |
    |                              |     with the action token    |
    |                              |     to set new password      |
    |                              |                              |
    |                              |     PUT /admin/realms/       |
    |                              |     {realm}/users/{id}/      |
    |                              |     reset-password           |
    |                              |     { \"type\":\"password\",     |
    |                              |       \"value\":\"NewPass!\",    |
    |                              |       \"temporary\":false }    |
    |                              |  --------------------------->|
    |                              |                              |
    |                              |  10. Terminate all sessions: |
    |                              |     DELETE /admin/realms/    |
    |                              |     {realm}/users/{id}/      |
    |                              |     sessions                 |
    |                              |  --------------------------->|
    |                              |                              |
    |  11. 302 to /login +         |                              |
    |      toast \"Password updated\"|                              |
    |  <--- redirect --------------|                              |
```

**Exact Keycloak Endpoints:**

| Step | Endpoint | Method | Purpose |
|---|---|---|---|
| 3 (lookup) | `/admin/realms/{realm}/users?email={email}&exact=true` | GET | Find user by email |
| 3 (action) | `/admin/realms/{realm}/users/{id}/execute-actions-email?lifespan=900` | PUT | Trigger reset email |
| 9 | `/admin/realms/{realm}/users/{id}/reset-password` | PUT | Set new password |
| 10 | `/admin/realms/{realm}/users/{id}/sessions` | DELETE | Kill all sessions |

---

## 3. React Component API Specifications (SDK: `@healthgate/react`)

### 3a. `<HealthGateLogin />`

```typescript
interface HealthGateLoginProps {
  /**
   * Application name displayed in \"Sign in to continue to {appName}\"
   * @default \"your account\"
   */
  appName?: string;

  /**
   * Whether to show the SSO/SAML button
   * @default true
   */
  showSSO?: boolean;

  /**
   * Whether to show the \"Sign up\" registration link
   * @default true
   */
  showRegistration?: boolean;

  /**
   * Callback fired after successful authentication
   * Receives the authenticated user object
   */
  onSuccess?: (user: HealthGateUser) => void;

  /**
   * Callback fired on authentication error
   */
  onError?: (error: HealthGateError) => void;

  /**
   * Override the post-login redirect URL
   * @default window.location.origin + \"/dashboard\"
   */
  redirectUri?: string;

  /**
   * Custom CSS class applied to the outermost container
   */
  className?: string;

  /**
   * Override default brand logo
   * Pass a React node (e.g., <img> or SVG component)
   */
  logo?: React.ReactNode;

  /**
   * Additional footer content (e.g., custom legal notices)
   */
  footerContent?: React.ReactNode;
}

// Usage:
<HealthGateLogin
  appName=\"Clinical Decision Support\"
  showSSO={true}
  onSuccess={(user) => router.push('/dashboard')}
  onError={(err) => console.error(err)}
/>
```

### 3b. `<HealthGateProvider />`

```typescript
interface HealthGateProviderProps {
  /**
   * Keycloak server URL (e.g., \"https://auth.googlehealth.com\")
   */
  keycloakUrl: string;

  /**
   * Keycloak realm name (e.g., \"healthgate-clinician\")
   */
  realm: string;

  /**
   * OIDC client ID registered in Keycloak
   */
  clientId: string;

  /**
   * Idle timeout in minutes before session warning
   * @default 15
   */
  idleTimeoutMinutes?: number;

  /**
   * Minutes before idle timeout to show warning dialog
   * @default 2
   */
  sessionWarningMinutes?: number;

  /**
   * Callback when session expires (idle or max lifetime)
   */
  onSessionExpired?: () => void;

  /**
   * Callback when an auth error occurs (token refresh failure, etc.)
   */
  onAuthError?: (error: HealthGateError) => void;

  /**
   * URL to redirect to when unauthenticated
   * @default \"/login\"
   */
  loginUrl?: string;

  /**
   * React children
   */
  children: React.ReactNode;
}

// Context value shape (internal, not exported as a prop):
interface HealthGateContextValue {
  user: HealthGateUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  token: string | null;                   // access token (short-lived, for API calls)
  login: (options?: LoginOptions) => void;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  roles: string[];
  hasRole: (roleName: string) => boolean;
  session: {
    expiresAt: Date | null;
    idleTimeRemaining: number;            // seconds
    isSessionWarningVisible: boolean;
    extendSession: () => Promise<void>;
  };
}

// Usage:
<HealthGateProvider
  keycloakUrl=\"https://auth.googlehealth.com\"
  realm=\"healthgate-clinician\"
  clientId=\"clinical-decision-support\"
  idleTimeoutMinutes={15}
  sessionWarningMinutes={2}
  onSessionExpired={() => router.push('/session-expired')}
>
  <App />
</HealthGateProvider>
```

### 3c. `useAuth()` Hook

```typescript
interface UseAuthReturn {
  /**
   * The authenticated user, or null if not logged in
   */
  user: HealthGateUser | null;

  /**
   * Whether the user is authenticated (has valid tokens)
   */
  isAuthenticated: boolean;

  /**
   * Whether the auth state is being determined (initial load, token refresh)
   */
  isLoading: boolean;

  /**
   * The current access token for API calls.
   * WARNING: This is the decrypted token for authorized API calls only.
   * Never store this in localStorage or pass to untrusted code.
   */
  token: string | null;

  /**
   * Initiates the login flow. Redirects to HealthGate login page.
   * @param options.redirectUri - Where to redirect after login
   */
  login: (options?: { redirectUri?: string }) => void;

  /**
   * Logs the user out. Clears all session state and redirects to login.
   * Calls Keycloak end_session_endpoint for SSO logout propagation.
   */
  logout: () => Promise<void>;

  /**
   * Manually triggers a token refresh. Normally automatic.
   * Throws HealthGateError if refresh fails after retries.
   */
  refresh: () => Promise<void>;
}

// Usage:
function DashboardHeader() {
  const { user, isAuthenticated, isLoading, logout } = useAuth();

  if (isLoading) return <Skeleton className=\"h-8 w-32\" />;
  if (!isAuthenticated) return null;

  return (
    <div>
      Welcome, {user.name}
      <Button variant=\"ghost\" onClick={logout}>Sign out</Button>
    </div>
  );
}
```

### 3d. `useSession()` Hook

```typescript
interface UseSessionReturn {
  /**
   * Absolute expiration time of the current session
   */
  expiresAt: Date | null;

  /**
   * Seconds remaining before idle timeout triggers
   * Updates every second when warning is visible
   */
  idleTimeRemaining: number;

  /**
   * Whether the session timeout warning dialog is currently visible
   */
  isSessionWarningVisible: boolean;

  /**
   * Extends the session by resetting the idle timer.
   * Calls the server to refresh the session.
   * Throws HealthGateError if the session has already expired server-side.
   */
  extendSession: () => Promise<void>;

  /**
   * The Keycloak session ID (for audit correlation)
   */
  sessionId: string | null;
}

// Usage:
function SessionInfo() {
  const { idleTimeRemaining, isSessionWarningVisible, extendSession } = useSession();

  return (
    <>
      <p>Session active. Idle timeout in {idleTimeRemaining}s</p>
      {isSessionWarningVisible && (
        <Button onClick={extendSession}>Stay signed in</Button>
      )}
    </>
  );
}
```

### 3e. `withAuth()` HOC

```typescript
interface WithAuthOptions {
  /**
   * Required roles. User must have ALL specified roles.
   * Uses realm roles by default.
   */
  requiredRoles?: string[];

  /**
   * URL to redirect to when not authenticated
   * @default \"/login\"
   */
  loginUrl?: string;

  /**
   * URL to redirect to when authenticated but missing required roles
   * @default renders a 403 \"no permission\" message
   */
  unauthorizedUrl?: string;

  /**
   * Component to render while auth state is loading
   * @default full-page centered spinner
   */
  loadingComponent?: React.ComponentType;
}

/**
 * Higher-order component that protects a page component.
 * Redirects to login if unauthenticated.
 * Shows 403 if authenticated but missing required roles.
 */
function withAuth<P extends object>(
  Component: React.ComponentType<P & { user: HealthGateUser }>,
  options?: WithAuthOptions
): React.ComponentType<P>;

// Usage:
function AdminPage({ user }: { user: HealthGateUser }) {
  return <div>Welcome admin {user.name}</div>;
}

export default withAuth(AdminPage, {
  requiredRoles: ['healthgate-admin'],
  unauthorizedUrl: '/unauthorized',
});
```

### Shared TypeScript Interfaces

```typescript
interface HealthGateUser {
  id: string;                             // Keycloak subject UUID
  email: string;
  name: string;
  firstName: string;
  lastName: string;
  roles: string[];                        // all roles (realm + client, flattened)
  realmRoles: string[];
  clientRoles: Record<string, string[]>;  // { \"app-id\": [\"role1\", \"role2\"] }
  mfaEnabled: boolean;
  lastLogin: string;                      // ISO 8601
  sessionId: string;
}

interface HealthGateError {
  code: HealthGateErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

type HealthGateErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_LOCKED'
  | 'MFA_REQUIRED'
  | 'MFA_INVALID'
  | 'SESSION_EXPIRED'
  | 'TOKEN_REFRESH_FAILED'
  | 'KEYCLOAK_UNREACHABLE'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NETWORK_ERROR'
  | 'UNKNOWN';

interface HealthGateConfig {
  keycloakUrl: string;
  realm: string;
  clientId: string;
  idleTimeoutMinutes: number;
  sessionWarningMinutes: number;
  onSessionExpired?: () => void;
  onAuthError?: (error: HealthGateError) => void;
}

interface LoginOptions {
  redirectUri?: string;
}
```

---

## 4. Animation & Micro-interaction Specs

All animations respect `prefers-reduced-motion: reduce` by conditionally disabling them. When reduced motion is preferred, all transitions are instant (0ms duration).

### 4.1 Page Transitions (Login -> MFA -> Dashboard)

**Approach:** No full-page animations between auth screens. Each screen loads as a fresh route via Next.js App Router. The transition is a standard browser navigation (no client-side route animation). Rationale: auth screens must work without JavaScript (NFR10), and client-side transitions add complexity without meaningful UX gain in a sequential auth flow.

**However**, within each page, the card content fades in on mount:

```css
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.auth-card-enter {
  animation: fadeInUp 200ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

@media (prefers-reduced-motion: reduce) {
  .auth-card-enter {
    animation: none;
    opacity: 1;
  }
}
```

### 4.2 Form Submission Loading States

**Button Spinner:**

```
[Continue]  -->  [<spinner> Signing in...]  -->  [Continue]  (on error)
                                               -->  [redirect] (on success)
```

- Spinner is `Loader2` from `lucide-react`, `h-4 w-4 animate-spin` (Tailwind's default spin: 1s linear infinite)
- Transition to loading state is instant (no fade)
- All form inputs are disabled via wrapping `<fieldset disabled>` -- this grays out the entire form consistently

**Input Disable During Submit:**

Inputs receive `opacity-50 cursor-not-allowed` via the fieldset's disabled state (handled natively by the browser).

### 4.3 Error Appearance

**Inline Errors (field-level):**

- Appear instantly on blur validation or on submit
- No animation (per UX spec section 2.6: \"Input state changes: instant\")
- Red text (`text-destructive`), `text-xs`, positioned directly below the input via `FormMessage`

**Banner Errors (form-level):**

```css
@keyframes slideDown {
  from {
    opacity: 0;
    max-height: 0;
    margin-top: 0;
  }
  to {
    opacity: 1;
    max-height: 100px;
    margin-top: 1rem;
  }
}

.form-banner-enter {
  animation: slideDown 200ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
  overflow: hidden;
}
```

- Banner slides down from the top of the form content area
- Background: `bg-destructive/10` (destructive color at 10% opacity), `border border-destructive/20`
- Icon: `AlertCircle` in destructive color, left-aligned
- Text: `text-sm text-destructive`

**Toast Errors (system-level, Sonner):**

- Sonner default animation: slides in from bottom-right
- Auto-dismiss after 5 seconds for informational, 8 seconds for errors
- Manual dismiss via close button
- Sonner configuration:

```typescript
<Toaster
  position=\"bottom-right\"
  toastOptions={{
    duration: 5000,
    className: 'font-ui',
    style: {
      '--toast-bg': 'var(--card)',
      '--toast-border': 'var(--border)',
      '--toast-text': 'var(--foreground)',
    },
  }}
/>
```

### 4.4 Session Timeout Countdown

**Timer Display:**

```
<span className=\"font-semibold tabular-nums\">
  {minutes}:{seconds.toString().padStart(2, '0')}
</span>
```

- `tabular-nums` ensures digits don't cause layout shift as values change (monospaced numerals)
- Updates every 1000ms via `setInterval`
- No additional animation on the numbers themselves -- they simply change value

**Dialog Entry Animation (AlertDialog from Radix):**

- Overlay: fades in 150ms `ease-out` (Radix default)
- Dialog: scales from 95% to 100% over 150ms `ease-out` (Radix default)
- These match the UX spec's transition values (section 2.6: Transform 200ms)

**When Timer Reaches 0:**

- No special animation -- immediate redirect to `/session-expired`
- The dialog closes as the page navigates away

### 4.5 Password Strength / Policy Helper

**PasswordPolicyHelper Animation:**

Each requirement line has a checkmark icon and text. When a requirement transitions from unmet to met:

```css
.policy-check-met {
  color: var(--green-600);
  transition: color 150ms ease-out;
}

.policy-check-icon {
  transition: transform 150ms ease-out, opacity 150ms ease-out;
}

.policy-check-icon-active {
  transform: scale(1);
  opacity: 1;
}

.policy-check-icon-inactive {
  transform: scale(0.8);
  opacity: 0.3;
}
```

Subtle: the checkmark icon scales from 0.8 to 1.0 and opacity from 0.3 to 1.0 over 150ms when the criterion is met. The color transitions from `text-muted-foreground` to `text-green-600`.

### 4.6 OTP Auto-Advance

When the user types a digit in an OTP slot:
- The digit appears instantly in the current slot
- Focus advances to the next slot with no delay (handled natively by `input-otp`)
- On the 6th digit entry: all slots briefly flash with a subtle border color change (`border-primary` for 200ms) before the auto-submit spinner appears. This gives a visual \"confirmation\" that all digits are entered.

```css
.otp-complete-flash .otp-slot {
  border-color: var(--primary);
  transition: border-color 200ms ease-out;
}
```

### 4.7 Password Visibility Toggle

When the eye icon is clicked:
- Icon changes instantly between `Eye` and `EyeOff` (lucide-react icons)
- No animation on icon swap
- Input `type` toggles between `password` and `text`
- 10-second auto-hide timer starts; when it fires, input reverts to `type=\"password\"` with no animation

---

## 5. Responsive Breakpoint Details

All screens use the **single centered column** layout (per UX spec section 7). There is no layout split at any breakpoint.

### Global Layout Rules

| Breakpoint | Container | Card Padding | Body Font Size |
|---|---|---|---|
| `<640px` (mobile) | `w-full px-4` (no max-width constraint) | `p-6` (24px) | `text-sm` (14px) |
| `640-1024px` (tablet) | `max-w-sm` (384px), centered | `p-8` (32px) | `text-sm` (14px) |
| `>1024px` (desktop) | `max-w-sm` (384px), centered | `p-8` (32px) | `text-sm` (14px) |

### Per-Screen Breakpoint Specifics

**S1 Login / S2 Register / S5 Forgot Password / S6 Reset Password / S10 Account Locked:**

| Element | `<640px` | `640-1024px` | `>1024px` |
|---|---|---|---|
| Card width | `w-full` (full viewport minus `px-4`) | `max-w-sm` (384px) | `max-w-sm` (384px) |
| Card padding | `p-6` | `p-8` | `p-8` |
| Page title | `text-2xl` (24px) | `text-3xl` (30px) | `text-3xl` (30px) |
| Input height | `h-11` (44px, touch target) | `h-10` (40px) | `h-10` (40px) |
| Button height | `h-11` (44px, touch target) | `h-10` (40px) | `h-10` (40px) |
| Logo size | 32px | 40px | 40px |
| Footer text | `text-[11px]` | `text-xs` (12px) | `text-xs` (12px) |

**S3 MFA Challenge / S4 MFA Setup:**

| Element | `<640px` | `640-1024px` | `>1024px` |
|---|---|---|---|
| OTP slot size | `h-12 w-12` (48px, touch) | `h-12 w-12` (48px) | `h-12 w-12` (48px) |
| OTP slot gap | `gap-2` (8px) | `gap-3` (12px) | `gap-3` (12px) |
| QR code size | 180x180px | 200x200px | 200x200px |
| Manual key text | `text-xs` | `text-sm` | `text-sm` |
| Card width | `w-full` | `max-w-[28rem]` (448px) | `max-w-[28rem]` (448px) |

**S7 Session Timeout Warning (AlertDialog):**

| Element | `<640px` | `640-1024px` | `>1024px` |
|---|---|---|---|
| Dialog width | `w-[calc(100%-2rem)]` | `max-w-sm` (384px) | `max-w-sm` (384px) |
| Button layout | Stacked vertically (`flex-col`) | Side by side (`flex-row`) | Side by side (`flex-row`) |
| Button height | `h-11` (44px touch target) | `h-10` | `h-10` |

**S9 Dashboard:**

| Element | `<640px` | `640-1024px` | `>1024px` |
|---|---|---|---|
| Main content padding | `p-4` | `p-6` | `p-8` |
| Header height | `h-14` (56px) | `h-16` (64px) | `h-16` (64px) |
| User menu | Icon only (avatar) | Avatar + name | Avatar + name |

### Touch Target Compliance

Per WCAG 2.1 AAA (adopted as AA floor per UX spec and NFR3):

- All interactive elements at `<640px` are minimum `44x44px`
- Password eye toggle: `p-2` padding around icon (total tap area 44px)
- Checkbox tap area: label click also toggles (via `htmlFor` association)
- Links: `py-2` on mobile for sufficient tap height
- OTP slots: `h-12 w-12` (48px) at all breakpoints

---

## 6. Accessibility Implementation Details

### S1: Login Page

**Tab Order (numbered):**

1. Skip to content link (hidden until focused): `<a href=\"#login-form\" className=\"sr-only focus:not-sr-only\">`
2. Email input (`autoFocus`)
3. Password input
4. Password visibility toggle (`<button aria-label=\"Show password\">`)
5. \"Forgot password?\" link
6. \"Continue\" submit button
7. \"SSO / SAML\" button
8. \"Sign up\" link
9. HIPAA Notice footer link
10. Privacy footer link
11. Terms footer link

**ARIA Attributes:**

```html
<form aria-label=\"Sign in\" noValidate>
  <div role=\"alert\" aria-live=\"assertive\">
    <!-- Form-level error banner renders here when present -->
  </div>

  <label htmlFor=\"login-email\">Email address</label>
  <input
    id=\"login-email\"
    type=\"email\"
    autoComplete=\"email\"
    aria-required=\"true\"
    aria-invalid={!!errors.email}
    aria-describedby={errors.email ? \"login-email-error\" : undefined}
  />
  <p id=\"login-email-error\" role=\"alert\">{errors.email?.message}</p>

  <label htmlFor=\"login-password\">Password</label>
  <div className=\"relative\">
    <input
      id=\"login-password\"
      type={showPassword ? \"text\" : \"password\"}
      autoComplete=\"current-password\"
      aria-required=\"true\"
      aria-invalid={!!errors.password}
      aria-describedby={errors.password ? \"login-password-error\" : undefined}
    />
    <button
      type=\"button\"
      aria-label={showPassword ? \"Hide password\" : \"Show password\"}
      aria-pressed={showPassword}
      tabIndex={0}
    >
      {showPassword ? <EyeOff /> : <Eye />}
    </button>
  </div>
  <p id=\"login-password-error\" role=\"alert\">{errors.password?.message}</p>

  <button type=\"submit\" aria-busy={isSubmitting}>
    {isSubmitting ? \"Signing in...\" : \"Continue\"}
  </button>
</form>
```

**Screen Reader Announcements:**

| Event | Method | Announcement |
|---|---|---|
| Error banner appears | `role=\"alert\"` + `aria-live=\"assertive\"` on banner container | \"Invalid email or password. Please try again.\" |
| Field error on blur | `role=\"alert\"` on `FormMessage` | \"Enter a valid email address\" |
| Loading state | `aria-busy=\"true\"` on submit button | Button text \"Signing in...\" is read |
| Successful redirect | N/A (page navigation) | New page title announced |

**Focus Management:**

- On page load: email input receives focus (`autoFocus`)
- On server error: focus moves to the error banner container
- On field error after submit: focus moves to the first invalid field

### S3: MFA Challenge

**Tab Order:**

1. OTP input (treated as single composite widget; internal navigation via arrow keys)
2. \"Verify\" button
3. \"Use a recovery code\" link
4. \"Back to sign in\" link

**ARIA Attributes:**

```html
<div role=\"group\" aria-label=\"6-digit verification code\">
  <input
    aria-label=\"Digit 1 of 6\"
    inputMode=\"numeric\"
    pattern=\"[0-9]\"
    maxLength={1}
  />
  <!-- ... slots 2-6 with corresponding aria-label -->
</div>
```

Note: shadcn's `InputOTP` component (built on `input-otp` library) handles these ARIA attributes internally. The library uses a single hidden input with a visual overlay, which provides correct screen reader behavior out of the box.

**Screen Reader Announcements:**

| Event | Method | Announcement |
|---|---|---|
| Code entered (auto-submit) | `aria-live=\"polite\"` on status region | \"Verifying code...\" |
| Verification failed | `role=\"alert\"` on error banner | \"Unable to verify. Please try again.\" |
| OTP cleared after error | Focus returned to first slot | Screen reader announces first slot label |

### S7: Session Timeout Warning

**ARIA Attributes:**

```html
<div
  role=\"alertdialog\"
  aria-modal=\"true\"
  aria-label=\"Session expiring\"
  aria-describedby=\"session-timeout-desc\"
>
  <h2 id=\"session-timeout-title\">Session expiring</h2>
  <p id=\"session-timeout-desc\">
    You'll be automatically signed out in
    <span role=\"timer\" aria-live=\"assertive\" aria-atomic=\"true\">
      {formatTime(secondsRemaining)}
    </span>
    due to inactivity.
  </p>
  <button autoFocus>Stay in</button>
  <button>Sign out</button>
</div>
```

**Critical:** The countdown uses `role=\"timer\"` with `aria-live=\"assertive\"`. However, announcing every second is excessive for screen readers. Implementation should throttle announcements:

- Announce immediately when dialog opens
- Announce at 1:00 remaining
- Announce at 0:30 remaining
- Announce at 0:10 remaining
- Announce at 0:00 (session expired)

This is achieved by updating the `aria-live` region content only at those thresholds, while visually updating the timer every second.

**Focus Management:**

- When dialog opens: \"Stay in\" button receives focus (`autoFocus`)
- Focus is trapped within the dialog (Radix AlertDialog handles this natively)
- When dialog closes (via \"Stay in\"): focus returns to the element that was focused before the dialog opened

### All Screens: Skip Link

Every auth page includes a skip link as the first focusable element:

```html
<a
  href=\"#main-content\"
  className=\"sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md\"
>
  Skip to main content
</a>
```

The target `#main-content` is placed on the card's content area (the form itself).

---

## 7. Dark Mode Token Mapping

The design system uses CSS custom properties that are swapped when the `.dark` class is applied to the `<html>` element. Below is the exact visual mapping per element category.

### Login Page Background

| Token | Light Mode | Dark Mode |
|---|---|---|
| `--background` | `oklch(0.978 0.008 85)` / `#faf9f5` (warm off-white) | `oklch(0.125 0.006 60)` / `#1f1e1d` (warm dark) |

### Card / Form Area

| Token | Light Mode | Dark Mode |
|---|---|---|
| `--card` | `oklch(0.978 0.008 85)` / `#faf9f5` (same as background; card floats via shadow) | `oklch(0.165 0.008 60)` / `#2a2928` (slightly lighter than background; elevated) |
| `--card-foreground` | `oklch(0.110 0.006 60)` / `#141413` | `oklch(0.978 0.008 85)` / `#faf9f5` |
| Card shadow | `0 2px 8px rgba(20,20,19,0.08)` | `0 2px 8px rgba(0,0,0,0.3)` (stronger shadow for contrast on dark bg) |

### Input Fields

| Property | Light Mode | Dark Mode |
|---|---|---|
| Border (`--input`) | `oklch(0.905 0.018 80)` / `#e8e6dc` (warm gray) | `oklch(1 0 0 / 15%)` / white at 15% opacity |
| Background | `transparent` (inherits card) | `transparent` (inherits card) |
| Text (`--foreground`) | `#141413` | `#faf9f5` |
| Placeholder (`--muted-foreground`) | `#b0aea5` | `#b0aea5` (maintained in dark) |
| Focus ring (`--ring`) | `oklch(0.700 0.140 45)` / `#d97757` | `oklch(0.700 0.140 45)` / `#d97757` (terracotta maintained) |
| Error border (`--destructive`) | `#e5484d` | `#e5484d` (maintained) |

### Buttons

**Primary (Terracotta CTA):**

| Property | Light Mode | Dark Mode |
|---|---|---|
| Background (`--primary`) | `#d97757` | `#d97757` (maintained) |
| Text (`--primary-foreground`) | `#faf9f5` | `#faf9f5` (maintained) |
| Hover | `#c15f3c` (darker terracotta) | `#c15f3c` (same) |
| Shadow | `0 1px 2px rgba(20,20,19,0.06)` | `0 1px 2px rgba(0,0,0,0.2)` |

**Secondary / Outline (SSO Button):**

| Property | Light Mode | Dark Mode |
|---|---|---|
| Background | `transparent` | `transparent` |
| Border | `--border` / `#e8e6dc` | `--border` / white at 12% |
| Text | `--foreground` / `#141413` | `--foreground` / `#faf9f5` |
| Hover background | `--accent` / `#f4f3ee` | `--accent` / `oklch(0.220 0.010 60)` / `#363534` |

**Ghost (User Menu, Password Toggle):**

| Property | Light Mode | Dark Mode |
|---|---|---|
| Background | `transparent` | `transparent` |
| Text | `--foreground` | `--foreground` |
| Hover background | `--accent` / `#f4f3ee` | `--accent` / `#363534` |

### Error Text

| Property | Light Mode | Dark Mode |
|---|---|---|
| Color (`--destructive`) | `oklch(0.577 0.245 27.325)` / `#e5484d` | `oklch(0.577 0.245 27.325)` / `#e5484d` (maintained -- red reads well on dark) |

### Links

| Property | Light Mode | Dark Mode |
|---|---|---|
| Default color (`--primary`) | `#d97757` | `#d97757` (maintained) |
| Hover color | `#c15f3c` | `#c15f3c` |
| Visited color | `#d97757` (no change -- security UX, don't reveal visited state) | `#d97757` |

### Implementation Notes

Dark mode toggle is controlled by:
1. User's system preference (`prefers-color-scheme: dark`) as default
2. Optional explicit toggle (not in V1 auth screens -- inherits from consumer app or system)

```css
:root {
  --background: oklch(0.978 0.008 85);
  --foreground: oklch(0.110 0.006 60);
  --card: oklch(0.978 0.008 85);
  --primary: oklch(0.700 0.140 45);
  /* ... all light tokens ... */
}

.dark {
  --background: oklch(0.125 0.006 60);
  --foreground: oklch(0.978 0.008 85);
  --card: oklch(0.165 0.008 60);
  --primary: oklch(0.700 0.140 45);  /* unchanged */
  /* ... all dark tokens ... */
}
```

---

## 8. Edge Case UX

### 8.1 What Happens if JavaScript is Disabled?

Per NFR10: \"All authentication flows must function without JavaScript disabled, via server-side rendered fallback forms (progressive enhancement).\"

**Implementation:**

- Auth pages use Next.js App Router Server Components by default. The HTML form is fully rendered server-side.
- The `<form>` element has a native `action` attribute pointing to the Next.js API route: `action=\"/api/auth/login\" method=\"POST\"`.
- Without JavaScript: form submits as a standard HTML form POST. The server processes it and returns a redirect (302) or re-renders the page with error messages embedded in the HTML.
- The OTP auto-submit does NOT work without JS. The \"Verify\" button serves as the fallback (which is why it exists despite auto-submit).
- The session timeout warning does NOT appear without JS. The session expires server-side after 15 minutes regardless. The next request returns 401 and redirects to `/session-expired`.
- Password visibility toggle does not work without JS. The password field remains `type=\"password\"`.
- `PasswordPolicyHelper` (real-time validation) does not work without JS. Server-side validation catches all errors and re-renders the form with error messages.
- `<noscript>` tag included on auth pages: `<noscript><p class=\"text-sm text-muted-foreground text-center mt-4\">For the best experience, please enable JavaScript in your browser.</p></noscript>`

### 8.2 What Happens on Very Slow Connections (>3s response)?

**Login Form Submit (>3s):**

- The \"Signing in...\" spinner continues indefinitely (no client-side timeout).
- If the request takes >10 seconds, the client side shows a subtle secondary message below the spinner: \"This is taking longer than usual...\" (via a `setTimeout` that sets additional state).
- If the request fails due to network timeout (browser-defined, typically 30-60s), the catch handler shows a toast: \"Unable to connect. Check your internet connection and try again.\"
- The button returns to its default \"Continue\" state.

**MFA Auto-Submit (>3s):**

- OTP slots remain locked with the entered digits visible.
- Spinner continues on the \"Verify\" button.
- Same timeout messaging as above.

**Page Load (>3s on 3G):**

- Next.js streaming SSR begins sending HTML immediately. The shell (background color, layout) renders before JavaScript hydrates.
- `loading.tsx` files in the App Router show a centered skeleton card with pulsing placeholder lines.
- Critical CSS is inlined. Fonts load asynchronously with `font-display: swap` to prevent invisible text.

### 8.3 What Happens with Browser Autofill Conflicts?

**Known Autofill Issues and Mitigations:**

| Issue | Mitigation |
|---|---|
| Chrome fills email+password but visually the labels overlap the filled values | Use floating labels that always stay above the input (shadcn/ui default), OR use placeholder text (our approach) that disappears when autofilled. The `Label` is positioned above the `Input`, not as a floating label, so this is a non-issue. |
| Password managers fill the wrong field (e.g., filling \"Confirm password\" with saved password) | `autoComplete=\"new-password\"` on register form forces password managers to generate/not-autofill. `autoComplete=\"current-password\"` on login form signals correct behavior. |
| Autofill changes input value but React state is stale (the `onChange` event doesn't fire for autofill) | Use the `input` event (native) or listen for `animationstart` on the `-webkit-autofill` pseudo-class to detect autofill and sync React state. shadcn/ui Input uses `onChange` which is triggered by modern browsers on autofill. As a safety net: form validation runs on submit (not just on change), catching any desync. |
| Chrome's yellow autofill background clashes with our warm off-white theme | Override via CSS: `input:-webkit-autofill { -webkit-box-shadow: 0 0 0 1000px var(--card) inset; -webkit-text-fill-color: var(--foreground); }` |

### 8.4 What Happens When User Navigates Back After Login?

**Scenario:** User logs in successfully, reaches `/dashboard`, then presses the browser Back button.

**Behavior:**

- The `/login` page is re-rendered.
- The `LoginPage` component checks auth state on mount via `useAuth()`.
- If the user is already authenticated (valid tokens in cookies), the page immediately redirects to `/dashboard` (or the configured redirect).
- The user never sees the login form in an authenticated state.
- Response header on login page: `Cache-Control: no-store, no-cache, must-revalidate` prevents the browser from showing a cached version of the login form with previously-entered credentials.

**Implementation (middleware):**

```typescript
// middleware.ts
if (isAuthPage(pathname) && hasValidSession(request)) {
  return NextResponse.redirect(new URL('/dashboard', request.url));
}
```

### 8.5 What Happens on Page Refresh During MFA Flow?

**Scenario:** User has entered credentials (step 1 of auth), is on `/login/mfa`, and refreshes the page.

**Behavior:**

- The partial authentication state is stored in an HttpOnly cookie (`hg-mfa-session`) set during the initial credential verification. This cookie contains an encrypted reference to the Keycloak authentication session (not the full credentials).
- On refresh, the MFA page checks for this cookie.
- If the cookie is present and the Keycloak auth session is still valid (has not expired -- Keycloak auth session timeout is 5 minutes): the MFA page renders normally.
- If the cookie is missing or the Keycloak auth session has expired: the user is redirected back to `/login` with no error message. They must re-enter credentials.
- The MFA session cookie has `Max-Age=300` (5 minutes), matching Keycloak's action token timeout.

### 8.6 What Happens with Multiple Tabs Open?

**Scenario 1: User is logged in with multiple tabs open. Session timeout warning appears.**

- Session idle tracking uses `BroadcastChannel` API (with `localStorage` event fallback for Safari < 15.4).
- When one tab detects the idle threshold and shows the warning, it broadcasts `{ type: 'SESSION_WARNING', secondsRemaining: 120 }`.
- All other tabs receive this message and show the warning dialog simultaneously.
- When the user clicks \"Stay in\" on any tab, that tab broadcasts `{ type: 'SESSION_EXTENDED' }`.
- All tabs dismiss their warning dialogs and reset their idle timers.
- If the user clicks \"Sign out\" on any tab, it broadcasts `{ type: 'SESSION_EXPIRED' }`.
- All tabs redirect to `/session-expired`.

**Scenario 2: User logs out in one tab.**

- Logout broadcasts `{ type: 'SESSION_EXPIRED' }` via BroadcastChannel.
- All other tabs receive the message, clear local state, and redirect to `/login`.
- Additionally, Keycloak's back-channel logout notifies the BFF endpoint, which invalidates the session cookie server-side.

**Scenario 3: User is on `/login` in two tabs and logs in from one.**

- After successful login in tab A, the session cookies are set.
- Tab B still shows the login form.
- When the user interacts with tab B (e.g., tries to submit), the middleware detects the valid session and redirects to `/dashboard`.
- Alternatively, if tab B is left idle, it remains on the login page (harmless).

**Scenario 4: User starts MFA in one tab and switches to another.**

- The MFA session is tied to a single authentication flow in Keycloak (identified by the `hg-mfa-session` cookie).
- Both tabs share the same cookie, so completing MFA in either tab completes the flow.
- If MFA is completed in tab A, tab B's MFA form will fail on submit (the auth session is consumed). The BFF detects this and redirects tab B to `/dashboard` (since the user is now fully authenticated).

---

### Critical Files for Implementation

- `/Users/avn/Desktop/prodACA/docs/phase0-discovery/05-ux-ui-design-spec.md` - Contains all 10 screen wireframes, design tokens (OKLCH color system, typography scale, spacing grid, shadows, transitions), component inventory, interaction states, error message patterns, responsive breakpoints, and accessibility requirements. This is the primary design source that every component tree in this document maps back to.

- `/Users/avn/Desktop/prodACA/docs/phase1-prd/06-prd.md` - Contains FR1-FR25 with detailed acceptance criteria that define exact behavior for every screen (login credentials handling, MFA auto-submit, session timeout thresholds, password policy rules, error message wording, token lifetimes, SDK interface contracts). Every form schema, error state, and Keycloak endpoint mapping in this document traces directly to PRD acceptance criteria.

- `/Users/avn/Desktop/prodACA/docs/phase0-discovery/02-user-personas.md` - Contains the 5 user personas (Dr. Sarah Chen, Maria Rodriguez, James Park, Priya Patel, Dr. Robert Kim) whose specific needs drive UX decisions throughout this document: session warning timing for clinicians, MFA simplicity for patients, SDK API surface for developers, and audit-trail requirements for the CISO.

- `/Users/avn/Desktop/prodACA/docs/phase0-discovery/01-product-brief.md` - Contains the 3-Zone architecture model, KR targets (p95 < 200ms login, 99.95% uptime, < 8 hour integration time), and the tech stack constraints (Keycloak 24+, Next.js 14 App Router, PostgreSQL 16) that bound all implementation decisions in this finalization.

- `/Users/avn/Desktop/prodACA/docs/phase0-discovery/03-competitive-analysis.md` - Contains the Keycloak selection rationale and competitive feature matrix that justify protocol choices (SAML 2.0 as a hard requirement, OIDC Authorization Code + PKCE), MFA method selection (TOTP primary, WebAuthn P2), and the SDK-first developer experience approach that differentiates HealthGate from Epic/Cerner/athena integration patterns."}],"stop_reason":"end_turn","stop_sequence":null,"usage":{"input_tokens":1,"cache_creation_input_tokens":6697,"cache_read_input_tokens":58802,"output_tokens":26561,"server_tool_use":{"web_search_requests":0,"web_fetch_requests":0},"service_tier":"standard","cache_creation":{"ephemeral_1h_input_tokens":6697,"ephemeral_5m_input_tokens":0},"inference_geo":"","iterations":[],"speed":"standard"}},"requestId":"req_011CYciyQNyNDKepBQRSo2Xr","type":"assistant","uuid":"1dcee202-bdb4-46e3-a857-14d8b6de1d4b","timestamp":"2026-03-01T17:12:21.811Z"}
