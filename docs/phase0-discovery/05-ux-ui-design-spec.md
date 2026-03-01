# HealthGate — Bare Metal UX/UI Design Spec

**Design System:** shadcn/ui (New York style) + Claude aesthetic
**Component Library:** shadcn/ui (Radix UI primitives + Tailwind CSS)
**Framework:** Next.js 14 (App Router)

---

## 1. Screen Inventory

| # | Screen | Route | Auth State | Purpose |
|---|---|---|---|---|
| S1 | Login | `/login` | Unauthenticated | Email + password entry |
| S2 | Register | `/register` | Unauthenticated | New account creation |
| S3 | MFA Challenge | `/login/mfa` | Partially authenticated | TOTP 6-digit code entry |
| S4 | MFA Setup | `/login/mfa-setup` | Partially authenticated | First-time TOTP enrollment (QR code) |
| S5 | Forgot Password | `/forgot-password` | Unauthenticated | Password reset request |
| S6 | Reset Password | `/reset-password` | Token-authenticated | New password entry |
| S7 | Session Timeout Warning | (Modal overlay) | Authenticated | "You'll be logged out in 2 min" |
| S8 | Session Expired | `/session-expired` | Unauthenticated | "Your session has ended" |
| S9 | Dashboard (Protected) | `/dashboard` | Authenticated | Post-login landing (placeholder) |
| S10 | Account Locked | `/account-locked` | Unauthenticated | After 5 failed attempts |

---

## 2. Design Tokens — Claude Theme on shadcn/ui

### 2.1 Color System (OKLCH)

shadcn/ui uses CSS variables in OKLCH color space. These override the defaults to match Claude's warm, editorial aesthetic.

**Light Mode (`:root`)**

| Token | OKLCH Value | Hex Approx | Usage |
|---|---|---|---|
| `--background` | `oklch(0.978 0.008 85)` | `#faf9f5` | Page background — warm off-white, NOT pure white |
| `--foreground` | `oklch(0.110 0.006 60)` | `#141413` | Primary text |
| `--card` | `oklch(0.978 0.008 85)` | `#faf9f5` | Card background — same as page (card floats via subtle shadow) |
| `--card-foreground` | `oklch(0.110 0.006 60)` | `#141413` | Card text |
| `--primary` | `oklch(0.700 0.140 45)` | `#d97757` | Terracotta — CTA buttons, focus rings, active states |
| `--primary-foreground` | `oklch(0.978 0.008 85)` | `#faf9f5` | Text on primary buttons |
| `--secondary` | `oklch(0.940 0.012 80)` | `#f4f3ee` | Secondary backgrounds (pampas) |
| `--secondary-foreground` | `oklch(0.110 0.006 60)` | `#141413` | Text on secondary |
| `--muted` | `oklch(0.940 0.012 80)` | `#f4f3ee` | Muted backgrounds |
| `--muted-foreground` | `oklch(0.640 0.020 60)` | `#b0aea5` | Placeholder text, helper text |
| `--accent` | `oklch(0.940 0.012 80)` | `#f4f3ee` | Hover backgrounds |
| `--destructive` | `oklch(0.577 0.245 27.325)` | `#e5484d` | Error states, destructive actions |
| `--border` | `oklch(0.905 0.018 80)` | `#e8e6dc` | Input borders, card borders — warm gray |
| `--input` | `oklch(0.905 0.018 80)` | `#e8e6dc` | Input field borders |
| `--ring` | `oklch(0.700 0.140 45)` | `#d97757` | Focus ring — matches primary |
| `--radius` | `0.5rem` | `8px` | Base border-radius |

**Dark Mode (`.dark`)**

| Token | OKLCH Value | Hex Approx | Usage |
|---|---|---|---|
| `--background` | `oklch(0.125 0.006 60)` | `#1f1e1d` | Dark warm background |
| `--foreground` | `oklch(0.978 0.008 85)` | `#faf9f5` | Light text on dark |
| `--card` | `oklch(0.165 0.008 60)` | `#2a2928` | Slightly elevated card |
| `--primary` | `oklch(0.700 0.140 45)` | `#d97757` | Terracotta maintained in dark |
| `--muted` | `oklch(0.220 0.010 60)` | `#363534` | Dark muted surfaces |
| `--muted-foreground` | `oklch(0.640 0.020 60)` | `#b0aea5` | Subdued text |
| `--border` | `oklch(1 0 0 / 12%)` | white @ 12% | Subtle borders |
| `--input` | `oklch(1 0 0 / 15%)` | white @ 15% | Input borders |

**Key principle:** Claude's palette is **warm neutral** — every gray has a slight amber/brown undertone. There are ZERO cool/blue grays anywhere.

---

### 2.2 Typography

Claude uses proprietary fonts (Galaxie Copernicus, Styrene B, Tiempos Text). We use the closest open-source equivalents:

| Role | Claude Font | Open-Source Substitute | Fallback Stack |
|---|---|---|---|
| Display / Headings | Galaxie Copernicus | **Cormorant Garamond** (Google Fonts) | `Georgia, 'Times New Roman', serif` |
| UI / Labels / Buttons | Styrene B | **Satoshi** (Fontshare, free) or **Inter** | `ui-sans-serif, system-ui, sans-serif` |
| Body / Descriptions | Tiempos Text | **Lora** (Google Fonts) | `Georgia, serif` |

**Type Scale:**

| Element | Font | Size | Weight | Line Height | Letter Spacing |
|---|---|---|---|---|---|
| Page title ("Welcome back") | Heading | `text-3xl` (30px) | 400 (Book) | 1.2 | `-0.02em` |
| Section subtitle | Heading | `text-xl` (20px) | 400 | 1.3 | `-0.01em` |
| Input label | UI | `text-sm` (14px) | 500 (Medium) | 1.4 | `0` |
| Input text | UI | `text-sm` (14px) | 400 | 1.5 | `0` |
| Button text | UI | `text-sm` (14px) | 500 | 1.0 | `0.01em` |
| Helper / error text | UI | `text-xs` (12px) | 400 | 1.4 | `0` |
| Link text | UI | `text-sm` (14px) | 500 | 1.4 | `0` |
| Legal / footer text | Body | `text-xs` (12px) | 400 | 1.5 | `0` |

---

### 2.3 Spacing System

Using Tailwind's default 4px grid:

| Spacing | Value | Usage |
|---|---|---|
| `gap-1.5` | 6px | Label to input |
| `gap-4` | 16px | Between form field groups |
| `gap-5` | 20px | Between form fields (vertical) |
| `gap-6` | 24px | Button top margin from last field |
| `p-8` | 32px | Card/form padding (desktop) |
| `p-6` | 24px | Card/form padding (mobile) |
| `gap-8` | 32px | Logo to form top |
| `gap-12` | 48px | Major section breaks |

---

### 2.4 Border Radius

| Token | Value | Usage |
|---|---|---|
| `--radius` (base) | `0.5rem` (8px) | Cards, dialogs |
| `rounded-md` | `calc(var(--radius) - 2px)` = 6px | Inputs, buttons |
| `rounded-sm` | `calc(var(--radius) - 4px)` = 4px | Badges, tags, small elements |

---

### 2.5 Shadows

Claude's UI is nearly flat. Minimal elevation:

| Level | Value | Usage |
|---|---|---|
| None | `shadow-none` | Most elements, default |
| Subtle | `0 1px 2px rgba(20,20,19,0.06)` | Buttons (New York style) |
| Card | `0 2px 8px rgba(20,20,19,0.08), 0 1px 2px rgba(20,20,19,0.04)` | Login card (subtle float) |
| Dialog | `0 4px 16px rgba(20,20,19,0.12)` | Session timeout modal |

---

### 2.6 Transitions

| Property | Duration | Easing | Usage |
|---|---|---|---|
| Color/opacity | `150ms` | `ease-out` | Button hover, focus states |
| Transform | `200ms` | `cubic-bezier(0.16, 1, 0.3, 1)` | Modal enter/exit |
| None | — | — | Input state changes (instant) |

---

## 3. shadcn/ui Components Required

Install via: `npx shadcn@latest add <name>`

| Component | CLI Name | Auth Usage |
|---|---|---|
| Button | `button` | "Continue", "Sign in", "Submit" CTAs |
| Input | `input` | Email, password, TOTP code fields |
| Label | `label` | Field labels |
| Card | `card` | Login form container |
| Form | `form` | Form validation (React Hook Form + Zod) |
| Dialog | `dialog` | Session timeout warning modal |
| Alert Dialog | `alert-dialog` | Destructive confirmations |
| Sonner (Toast) | `sonner` | Error/success notifications |
| Tabs | `tabs` | Login / Register toggle (if combined page) |
| Separator | `separator` | "or continue with" divider |
| Checkbox | `checkbox` | "Remember this device" |
| Input OTP | `input-otp` | 6-digit MFA code entry |

**Style variant:** `new-york` (more refined shadows, tighter focus rings)

---

## 4. Screen Wireframes (ASCII)

### S1: Login Page

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│              bg: #faf9f5 (warm off-white)                │
│                                                         │
│                    ╔═══╗                                 │
│                    ║ ✦ ║  HealthGate                     │
│                    ╚═══╝                                 │
│                                                         │
│           ┌─────────────────────────────┐               │
│           │                             │               │
│           │   Welcome back              │  ← Cormorant  │
│           │                             │    Garamond    │
│           │   Sign in to continue to    │    30px, 400   │
│           │   [App Name]                │               │
│           │                             │               │
│           │   ┌─────────────────────┐   │               │
│           │   │ Email address       │   │  ← Input      │
│           │   └─────────────────────┘   │    h-10, 14px  │
│           │           6px gap            │               │
│           │   ┌─────────────────────┐   │               │
│           │   │ Password        👁  │   │  ← Input      │
│           │   └─────────────────────┘   │    + eye toggle│
│           │                             │               │
│           │   Forgot password?          │  ← Link       │
│           │                             │    #d97757     │
│           │   ┌─────────────────────┐   │               │
│           │   │     Continue        │   │  ← Button     │
│           │   └─────────────────────┘   │    primary,    │
│           │         bg: #d97757          │    terracotta  │
│           │                             │               │
│           │   ──── or continue with ─── │  ← Separator  │
│           │                             │               │
│           │   ┌─────────────────────┐   │               │
│           │   │  🏥 SSO / SAML      │   │  ← Button     │
│           │   └─────────────────────┘   │    secondary   │
│           │                             │               │
│           │   Don't have an account?    │               │
│           │   Sign up                   │  ← Link       │
│           │                             │               │
│           └─────────────────────────────┘               │
│                                                         │
│         max-w-sm (384px) · centered · p-8               │
│                                                         │
│           HIPAA Notice · Privacy · Terms                 │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Key UX decisions:**
- NO visible card border — form floats on background via subtle shadow only
- Eye icon toggles password visibility
- "Forgot password?" is a text link, not a button
- SSO button is secondary variant (outline, not filled)
- HIPAA notice in footer — required but non-intrusive
- Generic error: "Invalid email or password" — NEVER "user not found" vs "wrong password"

---

### S2: Register Page

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│                    ╔═══╗                                 │
│                    ║ ✦ ║  HealthGate                     │
│                    ╚═══╝                                 │
│                                                         │
│           ┌─────────────────────────────┐               │
│           │                             │               │
│           │   Create your account       │               │
│           │                             │               │
│           │   ┌─────────────────────┐   │               │
│           │   │ Full name           │   │               │
│           │   └─────────────────────┘   │               │
│           │                             │               │
│           │   ┌─────────────────────┐   │               │
│           │   │ Email address       │   │               │
│           │   └─────────────────────┘   │               │
│           │                             │               │
│           │   ┌─────────────────────┐   │               │
│           │   │ Password        👁  │   │               │
│           │   └─────────────────────┘   │               │
│           │   12+ chars, uppercase,     │  ← Helper     │
│           │   lowercase, number,        │    text-xs     │
│           │   special char              │    muted       │
│           │                             │               │
│           │   ┌─────────────────────┐   │               │
│           │   │ Confirm password 👁  │   │               │
│           │   └─────────────────────┘   │               │
│           │                             │               │
│           │   ☐ I agree to the Terms    │               │
│           │     of Service and Privacy  │               │
│           │     Policy                  │               │
│           │                             │               │
│           │   ┌─────────────────────┐   │               │
│           │   │   Create account    │   │               │
│           │   └─────────────────────┘   │               │
│           │                             │               │
│           │   Already have an account?  │               │
│           │   Sign in                   │               │
│           │                             │               │
│           └─────────────────────────────┘               │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Password policy (displayed as helper text, validated with Zod):**
- Minimum 12 characters
- At least 1 uppercase, 1 lowercase, 1 number, 1 special character
- Not in common breach lists (validated server-side by Keycloak)
- Real-time strength indicator (optional, Phase 2)

---

### S3: MFA Challenge

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│                    ╔═══╗                                 │
│                    ║ ✦ ║  HealthGate                     │
│                    ╚═══╝                                 │
│                                                         │
│           ┌─────────────────────────────┐               │
│           │                             │               │
│           │   Two-factor                │               │
│           │   authentication            │               │
│           │                             │               │
│           │   Enter the 6-digit code    │               │
│           │   from your authenticator   │               │
│           │   app.                       │               │
│           │                             │               │
│           │   ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐           │
│           │   │  │ │  │ │  │ │  │ │  │ │  │           │
│           │   └──┘ └──┘ └──┘ └──┘ └──┘ └──┘           │
│           │     shadcn InputOTP component               │
│           │     auto-advances on each digit              │
│           │     auto-submits on 6th digit                │
│           │                             │               │
│           │   ┌─────────────────────┐   │               │
│           │   │      Verify         │   │               │
│           │   └─────────────────────┘   │               │
│           │                             │               │
│           │   Can't access your code?   │               │
│           │   Use a recovery code       │  ← Link       │
│           │                             │               │
│           │   ← Back to sign in         │  ← Link       │
│           │                             │               │
│           └─────────────────────────────┘               │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Key UX decisions:**
- Uses shadcn `input-otp` — 6 individual digit boxes
- Auto-advance: cursor moves to next box on input
- Auto-submit: form submits when 6th digit entered (no button press needed)
- "Verify" button as fallback for accessibility
- Recovery code link for locked-out users
- Back link does NOT say "different account" — avoids username enumeration

---

### S4: MFA Setup (First Time)

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│                    ╔═══╗                                 │
│                    ║ ✦ ║  HealthGate                     │
│                    ╚═══╝                                 │
│                                                         │
│           ┌─────────────────────────────┐               │
│           │                             │               │
│           │   Set up two-factor         │               │
│           │   authentication            │               │
│           │                             │               │
│           │   Scan this QR code with    │               │
│           │   your authenticator app    │               │
│           │   (Google Authenticator,    │               │
│           │    Authy, or similar).      │               │
│           │                             │               │
│           │        ┌───────────┐        │               │
│           │        │           │        │               │
│           │        │  QR CODE  │        │               │
│           │        │  200x200  │        │               │
│           │        │           │        │               │
│           │        └───────────┘        │               │
│           │                             │               │
│           │   Can't scan? Enter this    │               │
│           │   code manually:            │               │
│           │   JBSW Y3DP EHPK 3PXP      │  ← monospace  │
│           │                             │               │
│           │   Enter the 6-digit code    │               │
│           │   to verify setup:          │               │
│           │                             │               │
│           │   ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐           │
│           │   │  │ │  │ │  │ │  │ │  │ │  │           │
│           │   └──┘ └──┘ └──┘ └──┘ └──┘ └──┘           │
│           │                             │               │
│           │   ┌─────────────────────┐   │               │
│           │   │  Verify and enable  │   │               │
│           │   └─────────────────────┘   │               │
│           │                             │               │
│           └─────────────────────────────┘               │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**After successful setup → show recovery codes:**
```
┌─────────────────────────────────────┐
│                                     │
│   Save your recovery codes          │
│                                     │
│   If you lose access to your        │
│   authenticator app, you can use    │
│   these codes to sign in. Each      │
│   code can only be used once.       │
│                                     │
│   ┌─────────────────────────────┐   │
│   │  a1b2c-3d4e5                │   │
│   │  f6g7h-8i9j0                │   │
│   │  k1l2m-3n4o5                │   │
│   │  p6q7r-8s9t0                │   │
│   │  u1v2w-3x4y5                │   │
│   └─────────────────────────────┘   │
│                                     │
│   ┌──────────┐  ┌──────────────┐    │
│   │  Copy    │  │  Download    │    │
│   └──────────┘  └──────────────┘    │
│                                     │
│   ☐ I've saved these codes          │
│                                     │
│   ┌─────────────────────────────┐   │
│   │       Continue              │   │
│   └─────────────────────────────┘   │
│                                     │
└─────────────────────────────────────┘
```

---

### S7: Session Timeout Warning (Dialog Overlay)

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│         ░░░░░░ dimmed app content ░░░░░░░               │
│                                                         │
│           ┌─────────────────────────────┐               │
│           │                             │               │
│           │   Session expiring          │               │
│           │                             │               │
│           │   You'll be automatically   │               │
│           │   signed out in 1:47        │  ← countdown  │
│           │   due to inactivity.        │    live timer  │
│           │                             │               │
│           │   ┌──────────┐ ┌──────────┐ │               │
│           │   │ Sign out │ │ Stay in  │ │               │
│           │   │          │ │          │ │               │
│           │   └──────────┘ └──────────┘ │               │
│           │    secondary     primary     │               │
│           │                             │               │
│           └─────────────────────────────┘               │
│                                                         │
│         ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░                │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Behavior:**
- Appears at **2 minutes** before idle timeout (13 min of 15 min)
- Live countdown timer updates every second
- "Stay in" resets the idle timer (makes an API call to refresh session)
- "Sign out" triggers immediate logout
- If timer reaches 0:00 → auto-redirect to Session Expired page
- Dialog is **not dismissable** by clicking outside or pressing Escape (critical security UX)
- Uses shadcn `AlertDialog` (not `Dialog`) — forces user action

---

### S10: Account Locked

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│                    ╔═══╗                                 │
│                    ║ ✦ ║  HealthGate                     │
│                    ╚═══╝                                 │
│                                                         │
│           ┌─────────────────────────────┐               │
│           │                             │               │
│           │   Account temporarily       │               │
│           │   locked                    │               │
│           │                             │               │
│           │   For your security, this   │               │
│           │   account has been locked   │               │
│           │   after multiple failed     │               │
│           │   sign-in attempts.         │               │
│           │                             │               │
│           │   Try again in 15 minutes,  │               │
│           │   or reset your password.   │               │
│           │                             │               │
│           │   ┌─────────────────────┐   │               │
│           │   │  Reset password     │   │               │
│           │   └─────────────────────┘   │               │
│           │                             │               │
│           │   ← Back to sign in         │               │
│           │                             │               │
│           └─────────────────────────────┘               │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Key security UX:** Message does NOT say "after 5 failed attempts" — avoids confirming the exact lockout threshold to attackers.

---

## 5. Interaction States

### 5.1 Input Field States

```
DEFAULT          FOCUS            ERROR            DISABLED
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ Email    │    │ Email    │    │ Email    │    │ Email    │
│          │    │ █        │    │ bad@     │    │          │
└──────────┘    └──────────┘    └──────────┘    └──────────┘
 border:          border:         border:          border:
 #e8e6dc          #d97757         #e5484d          #e8e6dc
 1px solid        1px solid       1px solid        opacity: 0.5
                  ring: 2px       ↓
                  #d97757/20%     "Enter a valid
                                  email address"
                                  text-xs #e5484d
```

### 5.2 Button States

```
DEFAULT          HOVER            ACTIVE           LOADING          DISABLED
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ Continue │    │ Continue │    │ Continue │    │ ○ ...    │    │ Continue │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
 bg: #d97757     bg: #c15f3c     bg: #bd5d3a     bg: #d97757     bg: #d97757
 text: #faf9f5   text: #faf9f5   text: #faf9f5   spinner         opacity: 0.5
                 cursor:pointer  scale: 0.99      + "Signing      cursor:
                                 (subtle press)   in..."          not-allowed
```

### 5.3 Link States

```
DEFAULT          HOVER            FOCUS
Forgot           Forgot           Forgot
password?        password?        password?
───────          ─────────        ─────────
text: #d97757    text: #c15f3c    text: #d97757
no underline     underline        ring: 2px
                                  outline offset
```

---

## 6. Error Message Patterns

### HIPAA Security Requirement: Generic Error Messages

Error messages must NEVER leak information about whether an account exists.

| Scenario | BAD (Information Leak) | GOOD (Generic) |
|---|---|---|
| Wrong password | "Incorrect password" | "Invalid email or password" |
| Email not found | "No account with this email" | "Invalid email or password" |
| Account locked | "Locked after 5 attempts" | "Account temporarily locked" |
| MFA code wrong | "Invalid code" | "Unable to verify. Please try again." |
| Password reset for unknown email | "Email not found" | "If an account exists, you'll receive a reset link." |

### Error Display Patterns

**Inline (field-level):** Below the relevant input. Red text (`--destructive`), `text-xs`.
```
┌─────────────────────┐
│ Email               │
│ not-an-email        │
└─────────────────────┘
  Enter a valid email address    ← inline, below field
```

**Banner (form-level):** Above the form. Used for auth failures.
```
┌─────────────────────────────────────┐
│ ⚠ Invalid email or password.       │  ← destructive bg, rounded-md
│   Please try again.                │     appears above form fields
└─────────────────────────────────────┘
```

**Toast (system-level):** Bottom-right corner. Used for network errors, server errors.
```
                              ┌──────────────────────┐
                              │ ✕ Something went     │
                              │   wrong. Please try  │
                              │   again later.       │
                              └──────────────────────┘
```

---

## 7. Responsive Behavior

| Breakpoint | Width | Behavior |
|---|---|---|
| Mobile | `< 640px` (`sm`) | Form padding reduces to `p-6`. Full-width form. Logo smaller. |
| Tablet | `640–1024px` (`md`) | Centered `max-w-sm` (384px). Standard padding `p-8`. |
| Desktop | `> 1024px` (`lg`) | Same as tablet — login form stays `max-w-sm`, centered. |

**Mobile-specific:**
- Touch targets minimum `44px` height (Apple HIG / WCAG 2.1)
- Password eye toggle enlarged to 44x44px tap target
- InputOTP boxes sized at minimum 44x44px per digit
- No horizontal scroll — all content within viewport

**No layout split:** Unlike some login pages (e.g., image on left, form on right), HealthGate uses a **single centered column** at all breakpoints. This matches Claude's approach and ensures consistency.

---

## 8. Accessibility (WCAG 2.1 AA)

| Requirement | Implementation |
|---|---|
| **Color Contrast** | All text meets 4.5:1 ratio. `#141413` on `#faf9f5` = 17.5:1. `#d97757` on `#faf9f5` = 3.5:1 (decorative only — buttons use white text on terracotta = 4.6:1) |
| **Focus Indicators** | 2px ring in `--ring` (#d97757) with 2px offset. Visible on all interactive elements |
| **Keyboard Navigation** | Full tab order: email → password → forgot link → submit → SSO → signup link. No tab traps |
| **Screen Reader** | All inputs have associated `<label>`. Errors use `aria-describedby`. Loading states use `aria-live="polite"`. Password toggle: `aria-label="Show password"` / `"Hide password"` |
| **Error Identification** | Errors are associated with inputs via `aria-invalid="true"` + `aria-describedby` pointing to error message |
| **Autofill** | `autocomplete="email"` and `autocomplete="current-password"` on login. `autocomplete="new-password"` on register |
| **Motion** | Respects `prefers-reduced-motion`. Disables all transitions/animations |
| **Zoom** | Layout functional up to 200% zoom. No horizontal scrolling |

---

## 9. Security-Specific UX Rules

| Rule | Rationale | Implementation |
|---|---|---|
| No PHI on login screens | Login page = Zone 1 (public). PHI = Zone 3 only | No patient names, conditions, or any health data anywhere in auth flow |
| Generic error messages | Prevent username enumeration (§164.312(d)) | See Error Patterns section above |
| No password in URL | Prevent logging in server/proxy access logs | POST method only, HTTPS, no query params |
| Session warning before timeout | Clinician UX — prevent data loss | AlertDialog at 13 min, auto-logout at 15 min |
| Fail closed on auth error | If token validation fails, deny access | Middleware returns 401, redirects to login. Never renders protected content on error |
| No "remember me" for shared workstations | Prevents next user from accessing previous session | Device trust is opt-in, admin-configurable per policy |
| Password visibility toggle | Usability + security balance | Eye icon, defaults to hidden. Reverts to hidden after 10 sec |
| Rate-limited login UI | Prevent rapid-fire brute force from UI | Disable submit button for 2 sec after failed attempt, incrementing delay |
