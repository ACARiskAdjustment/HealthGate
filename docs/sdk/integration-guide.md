# HealthGate React SDK — Integration Guide

## Overview

The HealthGate React SDK provides a complete authentication solution for Google Health web applications. It wraps Keycloak OIDC with HIPAA-compliant session management, role-based access control, and pre-built UI components.

**Key features:**
- Drop-in `<HealthGateProvider>` with automatic session management
- `useAuth()` / `useSession()` hooks for auth state access
- `withAuth()` HOC and `<RoleGate>` for route/component protection
- Cross-tab session sync via BroadcastChannel
- Built-in session timeout warning with auto-logout
- WCAG 2.1 AA accessible components

---

## Installation

```bash
npm install @healthgate/react
```

**Peer dependencies** (automatically resolved):
- `react` >= 18.0
- `react-dom` >= 18.0

---

## Quick Start

### 1. Wrap your app with `HealthGateProvider`

```tsx
// app/layout.tsx (Next.js App Router)
import { HealthGateProvider } from "@healthgate/react";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <HealthGateProvider
          keycloakUrl="https://auth.googlehealth.com"
          realm="healthgate-clinician"
          clientId="my-app"
        >
          {children}
        </HealthGateProvider>
      </body>
    </html>
  );
}
```

### 2. Access auth state with `useAuth()`

```tsx
"use client";
import { useAuth } from "@healthgate/react";

export function ProfileBanner() {
  const { user, isAuthenticated, isLoading, logout } = useAuth();

  if (isLoading) return <div>Loading...</div>;
  if (!isAuthenticated) return <div>Not signed in</div>;

  return (
    <div>
      <p>Welcome, {user?.name}</p>
      <button onClick={logout}>Sign out</button>
    </div>
  );
}
```

### 3. Protect a route with `withAuth()`

```tsx
"use client";
import { withAuth } from "@healthgate/react";
import type { HealthGateUser } from "@healthgate/react";

function DashboardPage({ user }: { user: HealthGateUser }) {
  return <h1>Welcome back, {user.givenName}</h1>;
}

export default withAuth(DashboardPage, {
  requiredRoles: ["clinician"],
  loginUrl: "/login",
});
```

### 4. Conditional rendering with `<RoleGate>`

```tsx
import { RoleGate } from "@healthgate/react";

function AdminPanel() {
  return (
    <RoleGate roles={["admin"]} fallback={<p>Admin access required.</p>}>
      <AdminDashboard />
    </RoleGate>
  );
}
```

---

## Provider Configuration

```tsx
<HealthGateProvider
  keycloakUrl="https://auth.googlehealth.com"  // Required. Keycloak base URL
  realm="healthgate-clinician"                   // Required. Keycloak realm name
  clientId="my-app"                              // Required. OIDC client ID
  idleTimeoutMinutes={15}                        // Optional. Default: 15. Range: 5-60
  sessionWarningMinutes={2}                      // Optional. Default: 2. Warning before timeout
  loginUrl="/login"                              // Optional. Default: "/login". Redirect target
  onSessionExpired={() => {                      // Optional. Called when session expires
    console.log("Session expired");
  }}
  onAuthError={(error) => {                      // Optional. Called on auth errors
    console.error(error.code, error.message);
  }}
>
  {children}
</HealthGateProvider>
```

### Session Timeout Behavior

The provider automatically:
1. Tracks user activity (clicks, keystrokes, mouse movement, scroll, touch)
2. Resets the idle timer on any activity
3. Shows a `<SessionTimeoutWarning>` dialog 2 minutes before timeout
4. Syncs session state across browser tabs via BroadcastChannel
5. Auto-logouts when the idle timer expires

---

## Hooks

### `useAuth()`

Primary hook for authentication state and actions.

```tsx
const {
  user,            // HealthGateUser | null — Current user profile
  isAuthenticated, // boolean — Whether user is signed in
  isLoading,       // boolean — True during initial session check
  token,           // string | null — Current access token (for API calls)
  login,           // (options?: LoginOptions) => void — Redirect to login
  logout,          // () => Promise<void> — Sign out and clear session
  refresh,         // () => Promise<void> — Force token refresh
  roles,           // string[] — Combined realm + client roles
  hasRole,         // (roleName: string) => boolean — Check for a specific role
} = useAuth();
```

**Example: Token injection for API calls**

```tsx
const { token } = useAuth();

async function fetchPatientData(patientId: string) {
  const res = await fetch(`/api/patients/${patientId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}
```

### `useSession()`

Hook for session lifecycle management.

```tsx
const {
  expiresAt,                // Date | null — Absolute session expiry
  idleTimeRemaining,        // number — Milliseconds until idle timeout
  isSessionWarningVisible,  // boolean — Whether timeout warning is showing
  extendSession,            // () => Promise<void> — Extend session (refresh token)
  dismissAndLogout,         // () => void — Dismiss warning and sign out
} = useSession();
```

**Example: Custom session indicator**

```tsx
function SessionIndicator() {
  const { idleTimeRemaining, isSessionWarningVisible } = useSession();
  const minutes = Math.ceil(idleTimeRemaining / 60000);

  if (isSessionWarningVisible) {
    return <span className="text-red-500">Session expiring in {minutes}m</span>;
  }
  return <span className="text-green-500">Session active</span>;
}
```

### `useHealthGateContext()`

Low-level hook providing the full context value. Prefer `useAuth()` and `useSession()` for most use cases.

```tsx
const { user, session, config, ...authMethods } = useHealthGateContext();
```

---

## Components

### `<HealthGateLogin>`

Drop-in login page component with built-in form validation, error handling, and SSO support.

```tsx
import { HealthGateLogin } from "@healthgate/react";

function LoginPage() {
  return (
    <HealthGateLogin
      appName="Patient Portal"           // Optional. Shown in heading
      showSSO={true}                      // Optional. Show SSO button. Default: true
      showRegistration={true}             // Optional. Show register link. Default: true
      redirectUri="/dashboard"            // Optional. Post-login redirect
      onSuccess={(user) => {              // Optional. Called on successful login
        console.log("Logged in:", user.email);
      }}
      onError={(error) => {              // Optional. Called on login error
        console.error(error.code);
      }}
      logo={<img src="/logo.svg" />}     // Optional. Custom logo
      footerContent={<p>© 2026 Google Health</p>}  // Optional. Footer
    />
  );
}
```

### `withAuth()` (Higher-Order Component)

Wraps a component to enforce authentication and optional role requirements. Injects the `user` prop.

```tsx
import { withAuth } from "@healthgate/react";

function SecretPage({ user }: { user: HealthGateUser }) {
  return <p>Hello {user.name}</p>;
}

// Basic protection
export default withAuth(SecretPage);

// With role requirements
export default withAuth(SecretPage, {
  requiredRoles: ["admin", "clinician"],  // User must have ALL listed roles
  loginUrl: "/login",                      // Redirect if not authenticated
  unauthorizedUrl: "/403",                 // Redirect if missing roles
  loadingComponent: MySpinner,             // Custom loading indicator
});
```

### `<RoleGate>`

Inline conditional rendering based on user roles.

```tsx
import { RoleGate } from "@healthgate/react";

<RoleGate roles={["admin"]}>
  <AdminPanel />                         {/* Rendered only for admins */}
</RoleGate>

<RoleGate roles={["admin"]} fallback={<p>Admins only</p>}>
  <AdminPanel />                         {/* Fallback shown for non-admins */}
</RoleGate>
```

### `<UserMenu>`

Pre-built dropdown menu showing user avatar, name, email, and sign-out action. Requires `HealthGateProvider` context.

```tsx
import { UserMenu } from "@healthgate/react";

function Header() {
  return (
    <nav>
      <Logo />
      <UserMenu />
    </nav>
  );
}
```

### `<SessionTimeoutWarning>`

Session timeout warning dialog. Automatically rendered by `HealthGateProvider` — you typically don't need to use this directly.

```tsx
import { SessionTimeoutWarning } from "@healthgate/react";

<SessionTimeoutWarning
  remainingMs={120000}                   // Milliseconds until timeout
  onExtend={() => refreshSession()}      // Called when "Stay signed in" clicked
  onLogout={() => signOut()}             // Called when "Sign out" clicked
/>
```

### `<PasswordInput>`

Password input with toggle visibility and auto-hide security feature.

```tsx
import { PasswordInput } from "@healthgate/react";

<PasswordInput
  placeholder="Enter password"
  autoHideAfterMs={10000}               // Auto-hide after 10s (default)
  {...register("password")}             // Works with react-hook-form
/>
```

### `<OtpInput>`

6-digit OTP input with auto-advance, paste support, and keyboard navigation.

```tsx
import { OtpInput } from "@healthgate/react";

const [code, setCode] = useState("");

<OtpInput
  value={code}
  onChange={setCode}
  length={6}                            // Default: 6
  disabled={isSubmitting}
  autoFocus={true}                      // Default: true
/>
```

---

## Types Reference

### `HealthGateUser`

```typescript
interface HealthGateUser {
  sub: string;                           // Keycloak user ID (UUID)
  email: string;
  emailVerified: boolean;
  name: string;                          // Full display name
  givenName: string;
  familyName: string;
  preferredUsername: string;
  realmRoles: string[];                  // e.g., ["clinician", "mfa-verified"]
  clientRoles: Record<string, string[]>; // e.g., { "my-app": ["admin"] }
}
```

### `HealthGateError`

```typescript
interface HealthGateError {
  code: HealthGateErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

type HealthGateErrorCode =
  | "INVALID_CREDENTIALS"    // Wrong email/password
  | "ACCOUNT_LOCKED"         // Too many failed attempts
  | "MFA_REQUIRED"           // MFA challenge needed
  | "MFA_INVALID"            // Wrong TOTP code
  | "SESSION_EXPIRED"        // Session timed out
  | "TOKEN_REFRESH_FAILED"   // Could not refresh tokens
  | "KEYCLOAK_UNREACHABLE"   // IdP unavailable
  | "UNAUTHORIZED"           // Not authenticated
  | "FORBIDDEN"              // Insufficient roles
  | "NETWORK_ERROR"          // Network failure
  | "UNKNOWN";               // Unexpected error
```

### `HealthGateConfig`

```typescript
interface HealthGateConfig {
  keycloakUrl: string;
  realm: string;
  clientId: string;
  idleTimeoutMinutes: number;
  sessionWarningMinutes: number;
  onSessionExpired?: () => void;
  onAuthError?: (error: HealthGateError) => void;
}
```

---

## Customization

### Theme Override

HealthGate components use CSS variables for theming. Override in your global stylesheet:

```css
:root {
  --healthgate-bg: #faf9f5;
  --healthgate-accent: #d97757;
  --healthgate-text: #292524;
  --healthgate-muted: #a8a29e;
  --healthgate-border: #e7e5e4;
  --healthgate-destructive: #dc2626;
  --healthgate-success: #16a34a;
  --healthgate-radius: 0.5rem;
}
```

### Dark Mode

Add `class="dark"` to your HTML element. Components automatically adapt:

```css
.dark {
  --healthgate-bg: #1c1917;
  --healthgate-accent: #d97757;
  --healthgate-text: #fafaf9;
  --healthgate-muted: #78716c;
  --healthgate-border: #44403c;
}
```

---

## Development Setup

### Docker Compose (Recommended)

```bash
# Clone and start the full stack
git clone https://github.com/googlehealth/healthgate.git
cd healthgate
docker compose up -d

# Services started:
#   - Next.js BFF:  http://localhost:3000
#   - Keycloak:     http://localhost:8080 (admin/admin)
#   - PostgreSQL:   localhost:5432
```

### Pre-Seeded Test Users

| Email | Password | Roles | MFA |
|---|---|---|---|
| clinician@test.com | Test1234! | clinician | Enabled |
| admin@test.com | Test1234! | clinician, admin | Enabled |
| patient@test.com | Test1234! | patient | Enabled |

---

## Troubleshooting

### "useHealthGateContext must be used within HealthGateProvider"

Your component is not wrapped in `<HealthGateProvider>`. Ensure the provider is in a parent layout or component.

### Session expires immediately

Check that your Keycloak realm's session settings match the provider config. The BFF idle timeout should be ≤ the Keycloak SSO idle timeout.

### CSRF token validation failures

Ensure cookies are being sent with requests. If using a custom fetch wrapper, include `credentials: "include"`.

### Cross-tab sync not working

BroadcastChannel requires same-origin. Ensure all tabs are on the same domain. Falls back to localStorage polling in older browsers.

### Token refresh fails silently

Check browser console for CORS errors. The BFF's `/api/auth/refresh` endpoint must be on the same origin as the frontend.
