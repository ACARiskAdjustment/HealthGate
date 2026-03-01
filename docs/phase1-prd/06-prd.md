I have now thoroughly reviewed all five discovery documents. I have a complete understanding of the product brief, user personas, competitive analysis, stakeholder analysis, and UX/UI design specification. Let me produce the comprehensive PRD.

---

# HealthGate -- Product Requirements Document (PRD)

**Product Name:** HealthGate
**Tagline:** One secure front door for every Google Health application.
**Document Version:** 1.0
**Author:** Healthcare Product Architecture, Google Health
**Date:** 2026-03-01
**Status:** DRAFT -- Pending Engineering & Security Review
**Classification:** Google Confidential

---

## Table of Contents

1. Functional Requirements (FR1-FR25)
2. Non-Functional Requirements (NFR1-NFR12)
3. User Stories (Grouped by Persona)
4. Edge Cases & Failure Modes
5. Dependencies & Integration Requirements
6. Out of Scope
7. Risks & Mitigations
8. Success Criteria for PRD Sign-off

---

## 0. Architecture Reference

Before specifying requirements, this PRD assumes the 3-Zone isolation model documented in the Product Brief:

- **Zone 1 (Auth Plane):** Keycloak 24+ IdP, HealthGate Next.js frontend, auth-specific PostgreSQL 16 database. Contains ZERO PHI. Stores only: usernames, hashed credentials, MFA secrets, session metadata, audit events.
- **Zone 2 (Gateway):** API gateway / reverse proxy that validates tokens issued by Zone 1 before forwarding requests to Zone 3. Stateless.
- **Zone 3 (PHI Data Plane):** Downstream Google Health applications and their databases containing Protected Health Information.

Token format: OIDC-compliant JWTs signed by Keycloak. Access tokens are short-lived (5 minutes). Refresh tokens are longer-lived (configurable per realm policy, default 8 hours for clinician realm, 30 minutes for patient realm).

---

## 1. Functional Requirements

### FR1: Email + Password Authentication (Login)

**Priority:** P0
**Personas:** Dr. Sarah Chen (Clinician), Maria Rodriguez (Patient), James Park (Admin)
**HIPAA Mapping:** 164.312(d) -- Person or Entity Authentication

**Description:**
Users must be able to authenticate using an email address and password via the `/login` screen. The system delegates credential verification to Keycloak's OIDC Authorization Code Flow with PKCE. The Next.js frontend never receives, processes, or stores raw passwords -- all credential handling occurs server-side within Keycloak.

**Acceptance Criteria:**
1. Given a user navigates to `/login`, when the page loads, then the login form displays fields for "Email address" and "Password" with a "Continue" primary button.
2. Given a user enters a valid email and correct password and clicks "Continue", when Keycloak validates credentials, then the user receives an OIDC authorization code, the frontend exchanges it for tokens via back-channel, and the user is redirected to the originally requested page (or `/dashboard` if no redirect).
3. Given a user enters an invalid email or incorrect password, when the form is submitted, then a form-level banner error displays: "Invalid email or password. Please try again." -- the same message regardless of whether the email exists.
4. Given a user submits the login form, when the request is processing, then the "Continue" button enters a loading state displaying a spinner and the text "Signing in..." and the button is disabled to prevent double submission.
5. Given a user has MFA enabled, when credentials are validated successfully, then the user is redirected to `/login/mfa` (FR5) before receiving tokens.
6. The email field must include `autocomplete="email"` and the password field must include `autocomplete="current-password"`.
7. The password field includes a visibility toggle (eye icon). Password visibility auto-reverts to hidden after 10 seconds.
8. All login form submissions use HTTP POST over TLS 1.2+. No credentials appear in URL query parameters, browser history, or server access logs.
9. The login page renders in under 1 second on a 3G connection (Lighthouse performance score >= 90).

---

### FR2: User Registration

**Priority:** P0
**Personas:** Maria Rodriguez (Patient), James Park (Admin -- for admin-initiated registration)
**HIPAA Mapping:** 164.312(a)(2)(i) -- Unique User Identification

**Description:**
New users must be able to create an account via the `/register` screen. Registration collects: full name, email address, password, and password confirmation. Registration creates a Keycloak user entity with a unique identifier. After successful registration, the user is immediately redirected to MFA setup (FR6) before gaining access to any protected resource.

**Acceptance Criteria:**
1. Given a user navigates to `/register`, when the page loads, then the form displays fields for: Full name, Email address, Password (with visibility toggle), Confirm password (with visibility toggle), Terms of Service checkbox, and a "Create account" button.
2. Given a user fills in all fields correctly and the email is not already registered, when "Create account" is clicked, then a Keycloak user is created, the user is authenticated, and redirected to `/login/mfa-setup`.
3. Given a user enters an email that is already registered, when the form is submitted, then the system displays: "Unable to create account. Please try again or sign in." -- the message must NOT confirm whether the email exists (prevents enumeration).
4. Password helper text is displayed beneath the password field showing all requirements (see FR9) in muted text (`text-xs`, `--muted-foreground`).
5. Real-time client-side validation occurs on blur for each field. Server-side validation is the authoritative check.
6. The "Create account" button remains disabled until all fields pass client-side validation and the Terms checkbox is checked.
7. Email addresses are normalized to lowercase before submission.
8. The Confirm password field validates match with the Password field on blur and on submit.
9. Every newly created user receives a system-generated UUID as their Keycloak subject identifier. This UUID is immutable and used for all cross-system correlation.

---

### FR3: Logout

**Priority:** P0
**Personas:** Dr. Sarah Chen (Clinician), Maria Rodriguez (Patient), James Park (Admin)
**HIPAA Mapping:** 164.312(a)(2)(iii) -- Automatic Logoff

**Description:**
Users must be able to explicitly log out. Logout must terminate the Keycloak session, invalidate all tokens (access, refresh, and ID tokens), clear all client-side session artifacts (cookies, in-memory state), and redirect to the login page. For SSO scenarios, logout propagates across all relying-party applications via Keycloak's back-channel logout.

**Acceptance Criteria:**
1. Given an authenticated user clicks "Sign out", when the logout request is processed, then the Keycloak session is terminated server-side via the OIDC end_session_endpoint.
2. All HttpOnly cookies containing tokens are cleared with `Set-Cookie` headers setting `Max-Age=0`.
3. The user is redirected to `/login` with a toast notification: "You've been signed out."
4. Given the user has active sessions in other HealthGate-integrated applications (SSO), when they log out of one application, then Keycloak sends back-channel logout requests to all other relying parties with active sessions.
5. After logout, pressing the browser back button must NOT display any previously authenticated content. Protected pages must redirect to `/login`.
6. Given a logout request fails (Keycloak unreachable), then the frontend still clears all local session state (cookies, memory) and redirects to `/login`. The system fails closed.

---

### FR4: SSO / SAML 2.0 Integration

**Priority:** P0
**Personas:** Dr. Sarah Chen (Clinician), James Park (Admin)
**HIPAA Mapping:** 164.312(d) -- Person or Entity Authentication; 164.312(a)(2)(i) -- Unique User Identification

**Description:**
HealthGate must support SAML 2.0 as both a Service Provider (SP) and an Identity Provider (IdP) to enable SSO across the Google Health application portfolio and to federate with external hospital identity systems (Active Directory, Okta, Ping Identity). The login page includes a secondary "SSO / SAML" button that initiates SAML-based authentication.

**Acceptance Criteria:**
1. The login page displays a secondary-variant button labeled "SSO / SAML" below the separator ("or continue with").
2. Given an organization has a configured SAML IdP, when a user clicks "SSO / SAML" and enters their organizational email domain, then they are redirected to their organization's IdP login page via SAML 2.0 AuthnRequest.
3. Keycloak is configured as a SAML 2.0 SP with metadata available at `/.well-known/saml-metadata`.
4. SAML assertions must be signed (RSA-SHA256 minimum) and optionally encrypted (AES-256).
5. SAML NameID maps to the user's Keycloak unique identifier. If the user does not exist in Keycloak, a shadow account is provisioned via Keycloak's Identity Provider First Login flow.
6. Given a user authenticates via SSO and then navigates to a second HealthGate-integrated application, when the second application redirects to Keycloak for authentication, then Keycloak recognizes the existing session and issues tokens without requiring re-authentication (true SSO).
7. SSO sessions respect the same idle and maximum timeout policies as direct-login sessions (FR7).
8. James Park (Admin) can configure SAML IdP connections via the Keycloak admin console, including: metadata URL import, attribute mapping, and NameID format.
9. SAML authentication events are logged with the same detail as direct authentication events (FR14).

---

### FR5: MFA Challenge (TOTP Verification)

**Priority:** P0
**Personas:** Dr. Sarah Chen (Clinician), Maria Rodriguez (Patient), James Park (Admin)
**HIPAA Mapping:** 164.312(d) -- Person or Entity Authentication (multi-factor)

**Description:**
After successful credential verification, users with MFA enabled are redirected to `/login/mfa` to enter a 6-digit TOTP code from their authenticator application. The MFA challenge screen uses the shadcn `input-otp` component with auto-advance and auto-submit behavior.

**Acceptance Criteria:**
1. Given a user has successfully entered email and password and has MFA enabled, when they are redirected to `/login/mfa`, then the screen displays: heading "Two-factor authentication", instruction text "Enter the 6-digit code from your authenticator app.", a 6-digit OTP input (shadcn `InputOTP`), a "Verify" button, a "Can't access your code? Use a recovery code" link, and a "Back to sign in" link.
2. The `InputOTP` component auto-advances the cursor to the next digit box upon input.
3. Given a user enters the 6th digit, when all 6 digits are present, then the form auto-submits without requiring the user to click "Verify".
4. Given the TOTP code is correct (within the standard +/- 1 time-step window for clock skew, i.e., 90 seconds total), when submitted, then tokens are issued and the user is redirected to their target page.
5. Given an incorrect TOTP code, when submitted, then the display shows: "Unable to verify. Please try again." The OTP input is cleared, and focus returns to the first digit.
6. Given 5 consecutive failed MFA attempts, when the 5th incorrect code is submitted, then the authentication session is terminated, the user is redirected to `/account-locked`, and the Keycloak account is temporarily locked for 15 minutes.
7. The "Use a recovery code" link redirects to a form accepting an 11-character recovery code (format: `xxxxx-xxxxx`).
8. Given a valid recovery code is submitted, then the code is consumed (marked as used, single-use), the user is authenticated, and a Sonner toast warns: "Recovery code used. You have X codes remaining."
9. The "Back to sign in" link returns to `/login` and terminates the partial authentication session. This link must NOT reveal which step failed.
10. TOTP validation accepts codes for the current time step, the previous time step, and the next time step (standard 30-second windows, total 90s tolerance) to accommodate clock skew of up to 30 seconds.

---

### FR6: MFA Setup (First-Time Enrollment)

**Priority:** P0
**Personas:** Maria Rodriguez (Patient), Dr. Sarah Chen (Clinician)
**HIPAA Mapping:** 164.312(d) -- Person or Entity Authentication

**Description:**
New users and users who have not yet enrolled in MFA are redirected to `/login/mfa-setup` during their first authentication. This screen displays a QR code for TOTP enrollment, a manual entry secret, and requires verification of a code before MFA is activated. After successful activation, the system generates and displays 5 single-use recovery codes.

**Acceptance Criteria:**
1. Given a user has not enrolled in MFA and has just completed credential verification, when they are redirected to `/login/mfa-setup`, then the screen displays: heading "Set up two-factor authentication", instructional text naming compatible apps (Google Authenticator, Authy, or similar), a 200x200px QR code containing the TOTP provisioning URI, a "Can't scan?" toggle revealing the Base32 secret in monospace grouped format (e.g., `JBSW Y3DP EHPK 3PXP`), a 6-digit OTP input for verification, and a "Verify and enable" button.
2. The TOTP secret is generated with a minimum of 160 bits of entropy (20 bytes, Base32-encoded to 32 characters).
3. The TOTP provisioning URI follows RFC 6238 format: `otpauth://totp/HealthGate:{email}?secret={secret}&issuer=HealthGate&algorithm=SHA1&digits=6&period=30`.
4. Given the user scans the QR code and enters a valid 6-digit code, when "Verify and enable" is clicked, then MFA is activated for the account.
5. After successful activation, the screen transitions to display 5 recovery codes in the format `xxxxx-xxxxx` (alphanumeric, lowercase) within a bordered container.
6. Two buttons are provided: "Copy" (copies all codes to clipboard) and "Download" (downloads as `healthgate-recovery-codes.txt`).
7. A checkbox "I've saved these codes" must be checked before the "Continue" button becomes enabled.
8. Recovery codes are hashed (bcrypt, cost factor 12) before storage. Raw codes are shown only once, on this screen.
9. Given the user navigates away from the MFA setup page without completing setup, when they next authenticate, then they are redirected back to `/login/mfa-setup` to complete enrollment. MFA enrollment is mandatory -- it cannot be skipped.
10. The QR code must not be cached by the browser. The response includes `Cache-Control: no-store` and `Pragma: no-cache`.

---

### FR7: Session Management

**Priority:** P0
**Personas:** Dr. Sarah Chen (Clinician), Maria Rodriguez (Patient), James Park (Admin)
**HIPAA Mapping:** 164.312(a)(2)(iii) -- Automatic Logoff

**Description:**
HealthGate enforces configurable session timeouts to comply with HIPAA automatic logoff requirements. Sessions have two independent timers: idle timeout (inactivity) and maximum session lifetime (absolute). A warning dialog appears before idle timeout expiration, allowing users to extend their session.

**Acceptance Criteria:**
1. **Idle timeout default:** 15 minutes of inactivity. Configurable per-realm by Admin (James Park) within the range of 5-60 minutes.
2. **Maximum session lifetime default:** 12 hours for clinician realm, 30 minutes for patient realm. Configurable per-realm by Admin within the range of 15 minutes to 24 hours.
3. "Activity" is defined as: any mouse movement, keyboard input, touch event, or scroll event within the application window. Passive events (page visibility, background tabs) do NOT count as activity.
4. Given a user has been inactive for 13 minutes (idle timeout minus 2 minutes), when the warning threshold is reached, then a shadcn `AlertDialog` overlay appears with heading "Session expiring", body text "You'll be automatically signed out in [countdown] due to inactivity.", a live countdown timer updating every second, a secondary "Sign out" button, and a primary "Stay in" button.
5. The `AlertDialog` is NOT dismissable by clicking outside or pressing Escape. The user must choose "Stay in" or "Sign out".
6. Given the user clicks "Stay in", when the button is pressed, then the idle timer resets to the full 15 minutes (or configured value), the dialog closes, and a session refresh API call is made to Keycloak.
7. Given the countdown reaches `0:00`, when the timer expires, then the user is automatically logged out (FR3) and redirected to `/session-expired` with the message: "Your session has ended. For your security, you were automatically signed out due to inactivity. Sign in again to continue."
8. Given the maximum session lifetime is reached, regardless of activity, then the user is logged out immediately with no extension option. The redirect message on `/session-expired` reads: "Your session has ended. Please sign in again."
9. Access tokens have a lifetime of 5 minutes. Token refresh occurs silently via the refresh token when the access token is within 60 seconds of expiry.
10. Refresh tokens have a lifetime matching the maximum session lifetime (default: 12 hours clinician, 30 minutes patient).
11. Session state (idle timer, max timer) is tracked client-side. Token validity is the authoritative server-side session check.
12. Given a user has the same account active in multiple browser tabs, when one tab receives the session timeout warning, then all tabs receive the warning simultaneously (via `BroadcastChannel` API or `localStorage` event).

---

### FR8: Forced Logout (Admin-Initiated Session Termination)

**Priority:** P0
**Personas:** James Park (Admin)
**HIPAA Mapping:** 164.312(a)(1) -- Access Control; 164.308(a)(4) -- Information Access Management

**Description:**
Administrators must be able to terminate any active user session immediately from the admin console. This is critical for employee termination, suspected account compromise, and incident response.

**Acceptance Criteria:**
1. Given James Park is in the admin console viewing a user's detail page, when he clicks "Terminate all sessions", then all active Keycloak sessions for that user are revoked immediately via the Keycloak Admin REST API (`DELETE /admin/realms/{realm}/users/{id}/sessions`).
2. The revocation propagates to all relying-party applications within 30 seconds via back-channel logout.
3. The terminated user's next API request returns HTTP 401, and the frontend redirects to `/session-expired` with the message: "Your session has ended. Please sign in again."
4. Given James Park terminates sessions for a user, then an audit event is logged: `event_type: ADMIN_SESSION_TERMINATE`, `admin_user_id`, `target_user_id`, `timestamp`, `ip_address`, `reason` (free text, optional).
5. Bulk session termination is supported: Admin can select multiple users and terminate all their sessions in a single action.

---

### FR9: Password Policy

**Priority:** P0
**Personas:** All personas (enforced for all users)
**HIPAA Mapping:** 164.312(a)(2)(i) -- Unique User Identification; 164.308(a)(5)(ii)(D) -- Password Management

**Description:**
HealthGate enforces a HIPAA-compliant password policy via Keycloak password policy configuration. The policy is non-negotiable for all users and cannot be weakened by application teams.

**Acceptance Criteria:**
1. **Minimum length:** 12 characters.
2. **Complexity:** At least 1 uppercase letter, 1 lowercase letter, 1 digit, and 1 special character from the set: `!@#$%^&*()-_=+[]{};:'",.<>?/\|~`.
3. **Breach list check:** Passwords are validated server-side against the Keycloak password-blacklist policy (configurable dictionary) and, if network-connected, against the Have I Been Pwned Passwords API (k-anonymity model, only the first 5 characters of the SHA-1 hash are sent).
4. **Password history:** Users cannot reuse any of their last 12 passwords.
5. **Maximum age:** Passwords expire after 365 days. Users receive a warning banner 14 days before expiration: "Your password expires in X days. Change it now."
6. **No personal data:** Passwords must not contain the user's email prefix, first name, or last name (case-insensitive substring check).
7. Password requirements are displayed as helper text below the password field on registration and password change forms, using `text-xs` in `--muted-foreground` color.
8. Client-side validation provides immediate feedback on blur. Server-side validation by Keycloak is authoritative.
9. Password storage: Keycloak stores passwords using bcrypt with a minimum cost factor of 12 (configurable, default 12). Raw passwords are never logged, stored in plaintext, or transmitted outside TLS.

---

### FR10: Password Reset (Forgot Password)

**Priority:** P0
**Personas:** Maria Rodriguez (Patient), Dr. Sarah Chen (Clinician)
**HIPAA Mapping:** 164.312(d) -- Person or Entity Authentication

**Description:**
Users who have forgotten their password can request a reset via the `/forgot-password` screen. A time-limited, single-use reset link is sent to the registered email address. The reset flow must never reveal whether an email address is registered.

**Acceptance Criteria:**
1. Given a user navigates to `/forgot-password`, when the page loads, then the form displays: heading "Reset your password", body text "Enter the email address associated with your account and we'll send you a link to reset your password.", an email input field, and a "Send reset link" button.
2. Given a user submits any email address (whether registered or not), when the form is submitted, then the confirmation message always reads: "If an account exists with that email, you'll receive a password reset link shortly." -- no differentiation.
3. For registered emails, Keycloak sends a password reset email containing a single-use token valid for 15 minutes.
4. The reset email contains: subject line "Reset your HealthGate password", a "Reset password" button/link, expiration notice ("This link expires in 15 minutes"), and a note: "If you didn't request this, you can safely ignore this email."
5. Given a user clicks the reset link and it is valid, when `/reset-password?token={token}` loads, then the form displays: heading "Create a new password", Password field (with visibility toggle), Confirm password field (with visibility toggle), password requirements helper text, and a "Reset password" button.
6. Given the user submits a valid new password, when the reset is processed, then the password is updated, all existing sessions are terminated (force re-authentication), and the user is redirected to `/login` with a toast: "Password updated. Please sign in with your new password."
7. Given a user clicks an expired or already-used reset link, then the page displays: "This reset link has expired or has already been used. Please request a new one." with a link to `/forgot-password`.
8. Rate limiting: Maximum 3 password reset requests per email address per 15-minute window. Excess requests are silently dropped (no error shown to user, to prevent enumeration).

---

### FR11: Password Change (Authenticated)

**Priority:** P1
**Personas:** All authenticated users
**HIPAA Mapping:** 164.308(a)(5)(ii)(D) -- Password Management

**Description:**
Authenticated users must be able to change their password from an account settings page. This requires entry of the current password for verification before accepting the new password.

**Acceptance Criteria:**
1. The password change form is accessible from the user's account settings (linked from `/dashboard`).
2. The form requires: current password, new password (with visibility toggle), confirm new password (with visibility toggle).
3. The new password must comply with all FR9 password policy requirements.
4. Given the current password is incorrect, when the form is submitted, then the error message reads: "Current password is incorrect."
5. Given the password change succeeds, then all other active sessions for this user are terminated (the current session persists with new credentials), and an audit event is logged: `event_type: PASSWORD_CHANGE`.
6. A Sonner toast confirms: "Password changed successfully."

---

### FR12: Brute-Force Protection (Account Lockout)

**Priority:** P0
**Personas:** All (security protection), James Park (Admin -- configuration)
**HIPAA Mapping:** 164.312(a)(1) -- Access Control

**Description:**
HealthGate must protect against brute-force credential attacks via progressive lockout and rate limiting. Lockout behavior is configured in Keycloak and is transparent to the end user except for the locked account screen.

**Acceptance Criteria:**
1. **Threshold:** After 5 consecutive failed login attempts for a given account, the account is temporarily locked.
2. **Lockout duration:** 15 minutes for the first lockout. Subsequent lockouts within a 24-hour window double the duration: 15 min, 30 min, 60 min, then permanent lock requiring admin intervention.
3. Given an account is locked, when the user attempts to login, then they are redirected to `/account-locked` which displays: "Account temporarily locked. For your security, this account has been locked after multiple failed sign-in attempts. Try again in 15 minutes, or reset your password." The exact number of failed attempts is NOT disclosed.
4. The `/account-locked` page offers a "Reset password" button (primary) and a "Back to sign in" link.
5. **IP-level rate limiting:** Maximum 20 failed login attempts from a single IP address within a 5-minute window, regardless of target account. After this threshold, all requests from that IP receive HTTP 429 with a `Retry-After` header.
6. **UI-level throttle:** After a failed login attempt, the "Continue" button is disabled for 2 seconds. After 3 failures in the same browser session, the delay increases to 5 seconds.
7. Account lockout events generate an audit log entry: `event_type: ACCOUNT_LOCKED`, `user_id`, `ip_address`, `failure_count`, `lockout_duration_minutes`.
8. James Park can unlock accounts manually from the admin console at any time.
9. Successful login resets the failed attempt counter to zero.

---

### FR13: Role-Based Access Control (RBAC)

**Priority:** P0
**Personas:** James Park (Admin), Priya Patel (Developer)
**HIPAA Mapping:** 164.312(a)(1) -- Access Control; 164.308(a)(4) -- Information Access Management

**Description:**
HealthGate uses Keycloak's RBAC system to manage user permissions. Roles are defined at two levels: realm roles (global across all applications) and client roles (specific to an individual application). Tokens issued by Keycloak contain role claims that downstream applications use for authorization decisions.

**Acceptance Criteria:**
1. **Realm roles (pre-configured):** `healthgate-admin`, `clinician`, `patient`, `developer`, `auditor`. Additional realm roles can be created by admins.
2. **Client roles:** Each integrated application (Keycloak client) can define its own client-specific roles. For example, the Clinical Decision Support app might define `cds-viewer`, `cds-editor`, `cds-admin`.
3. Access tokens (JWT) include both realm roles and client roles in the `realm_access.roles` and `resource_access.{client_id}.roles` claims, respectively.
4. Given Priya Patel is developing a new application, when she configures her Keycloak client, then she can define custom client roles via the admin console or the Keycloak Admin REST API.
5. The React SDK (FR16) exposes a `useRoles()` hook that returns both realm and client roles for the current user, and a `hasRole(roleName: string)` function for conditional rendering.
6. Given a user does not have the required role for a resource, when they attempt to access it, then the system returns HTTP 403 Forbidden. The frontend displays: "You don't have permission to access this page."
7. Role assignments are audited: `event_type: ROLE_ASSIGN` and `event_type: ROLE_REVOKE`, including `admin_user_id`, `target_user_id`, `role_name`, `timestamp`.
8. Composite roles (roles that include other roles) are supported for hierarchical permission structures. Example: `healthgate-admin` includes `clinician` + `auditor` roles.

---

### FR14: Audit Logging

**Priority:** P0
**Personas:** Dr. Robert Kim (CISO), James Park (Admin)
**HIPAA Mapping:** 164.312(b) -- Audit Controls; 164.308(a)(1)(ii)(D) -- Information System Activity Review

**Description:**
HealthGate logs every authentication-related event in structured JSON format, suitable for ingestion by ELK (Elasticsearch, Logstash, Kibana) or any SIEM system. Audit logs are the single source of truth for "who accessed what, when" across the entire Google Health application portfolio.

**Acceptance Criteria:**
1. The following events are logged (minimum set):

| Event Type | Trigger |
|---|---|
| `LOGIN_SUCCESS` | Successful authentication (credentials + MFA) |
| `LOGIN_FAILURE` | Failed authentication attempt |
| `LOGOUT` | User-initiated logout |
| `LOGOUT_FORCED` | Admin-initiated session termination |
| `SESSION_EXPIRED` | Idle or max timeout |
| `SESSION_EXTENDED` | User clicked "Stay in" on timeout warning |
| `TOKEN_REFRESH` | Silent token refresh |
| `TOKEN_REFRESH_FAILURE` | Failed token refresh |
| `MFA_CHALLENGE_SUCCESS` | Correct TOTP/recovery code |
| `MFA_CHALLENGE_FAILURE` | Incorrect TOTP/recovery code |
| `MFA_ENROLLED` | MFA setup completed |
| `PASSWORD_CHANGE` | Authenticated password change |
| `PASSWORD_RESET_REQUEST` | Password reset email requested |
| `PASSWORD_RESET_COMPLETE` | Password successfully reset |
| `ACCOUNT_LOCKED` | Account locked due to brute-force |
| `ACCOUNT_UNLOCKED` | Admin-initiated unlock |
| `ROLE_ASSIGN` | Role added to user |
| `ROLE_REVOKE` | Role removed from user |
| `USER_CREATED` | New user registration |
| `USER_DISABLED` | User account disabled |
| `USER_ENABLED` | User account re-enabled |
| `SSO_LOGIN` | SSO/SAML-initiated login |
| `ADMIN_ACTION` | Any admin console action |

2. Each audit log entry contains the following fields:

```json
{
  "timestamp": "2026-03-01T14:30:00.000Z",
  "event_type": "LOGIN_SUCCESS",
  "user_id": "uuid-of-user",
  "username": "sarah.chen@googlehealth.com",
  "ip_address": "10.0.1.42",
  "user_agent": "Mozilla/5.0 ...",
  "session_id": "keycloak-session-uuid",
  "client_id": "clinical-decision-support",
  "realm": "healthgate-clinician",
  "auth_method": "password+totp",
  "result": "success",
  "details": {},
  "source_zone": "zone-1",
  "correlation_id": "request-trace-uuid"
}
```

3. **Retention:** Audit logs are retained for a minimum of 6 years and 210 days (6 years per HIPAA retention requirement at 164.530(j), plus 210 days buffer for investigations). This is enforced via ELK index lifecycle management or equivalent.
4. **Tamper evidence:** Logs are written to append-only storage. Each log batch includes a SHA-256 hash chain: each entry's hash incorporates the previous entry's hash, enabling detection of deletion or modification.
5. Logs must NOT contain: passwords (raw or hashed), MFA secrets, TOTP codes, recovery codes, session tokens, or any PHI.
6. **Search and export:** James Park and Dr. Robert Kim can search audit logs via the admin console by: user ID, date range, event type, IP address, client ID. Results are exportable as JSON or CSV.
7. **Real-time streaming:** Audit events are published to a configurable event stream (e.g., Kafka topic or webhook) within 5 seconds of occurrence for real-time SIEM integration.
8. Given Dr. Robert Kim requests an audit report for a specific user, when he queries the system, then all authentication events for that user across all integrated applications are returned in chronological order in a single response.

---

### FR15: Security Headers

**Priority:** P0
**Personas:** Dr. Robert Kim (CISO), Priya Patel (Developer)
**HIPAA Mapping:** 164.312(e)(1) -- Transmission Security

**Description:**
All HealthGate HTTP responses must include security headers that protect against common web vulnerabilities. These headers are applied at the Next.js middleware layer and are non-configurable by downstream applications.

**Acceptance Criteria:**
1. The following headers are present on every HTTP response:

| Header | Value | Purpose |
|---|---|---|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` | Force HTTPS for 1 year |
| `Content-Security-Policy` | `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' https://fonts.gstatic.com; connect-src 'self' {keycloak-url}; frame-ancestors 'none'; form-action 'self' {keycloak-url}; base-uri 'self'` | Prevent XSS, clickjacking |
| `X-Content-Type-Options` | `nosniff` | Prevent MIME sniffing |
| `X-Frame-Options` | `DENY` | Prevent clickjacking (legacy) |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limit referrer leakage |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=()` | Disable unnecessary APIs |
| `Cache-Control` | `no-store, no-cache, must-revalidate` (on auth pages) | Prevent caching of auth state |
| `Pragma` | `no-cache` (on auth pages) | Legacy cache prevention |
| `X-Request-Id` | `{uuid}` | Request correlation |

2. The CSP policy is tested with a CSP evaluator tool and does not use `unsafe-eval`.
3. `frame-ancestors 'none'` prevents HealthGate auth pages from being embedded in iframes (anti-clickjacking).
4. Given a request is made over HTTP (port 80), then it is redirected to HTTPS (port 443) with a 301 status code. No content is served over HTTP.

---

### FR16: React SDK for Developer Integration

**Priority:** P0
**Personas:** Priya Patel (Developer)
**HIPAA Mapping:** N/A (developer tooling)

**Description:**
HealthGate provides an npm package (`@healthgate/react`) containing React components, hooks, and utilities that enable any Google Health web application to integrate authentication in under 8 hours (KR3 target). The SDK handles all OIDC flows, token management, session monitoring, and UI rendering.

**Acceptance Criteria:**
1. **Package:** Published as `@healthgate/react` to the internal npm registry. TypeScript-first with full type definitions.
2. **Components exported:**

| Component | Purpose |
|---|---|
| `<HealthGateProvider>` | Context provider wrapping the app root. Configures Keycloak connection, realm, client ID. |
| `<HealthGateLogin />` | Pre-built login page (matches UX spec screens S1-S6, S10). Drop-in replacement for building custom login. |
| `<ProtectedRoute>` | Wrapper component that redirects to login if the user is not authenticated. Accepts `requiredRoles` prop. |
| `<SessionTimeoutWarning />` | Renders the session timeout AlertDialog (screen S7). Auto-manages timers. |
| `<UserMenu />` | Dropdown component displaying user name, email, role, and "Sign out" action. |

3. **Hooks exported:**

| Hook | Returns |
|---|---|
| `useAuth()` | `{ user, isAuthenticated, isLoading, login(), logout(), token }` |
| `useRoles()` | `{ roles: string[], hasRole(name: string): boolean }` |
| `useSession()` | `{ expiresAt, idleTimeRemaining, extendSession(), isSessionWarningVisible }` |
| `useHealthGate()` | Combined hook returning all above plus config. |

4. **TypeScript types exported:**

```typescript
interface HealthGateUser {
  id: string;               // Keycloak subject UUID
  email: string;
  name: string;
  roles: string[];
  realmRoles: string[];
  clientRoles: Record<string, string[]>;
  mfaEnabled: boolean;
  lastLogin: string;        // ISO 8601
  sessionId: string;
}

interface HealthGateConfig {
  keycloakUrl: string;
  realm: string;
  clientId: string;
  idleTimeoutMinutes?: number;    // default: 15
  sessionWarningMinutes?: number;  // default: 2
  onSessionExpired?: () => void;
  onAuthError?: (error: HealthGateError) => void;
}
```

5. **Minimal integration example (target: under 20 lines of code):**

```tsx
import { HealthGateProvider, ProtectedRoute } from '@healthgate/react';

export default function App() {
  return (
    <HealthGateProvider
      keycloakUrl="https://auth.googlehealth.com"
      realm="healthgate-clinician"
      clientId="clinical-decision-support"
    >
      <ProtectedRoute>
        <Dashboard />
      </ProtectedRoute>
    </HealthGateProvider>
  );
}
```

6. The SDK handles token storage in HttpOnly cookies (set via a companion BFF endpoint). Tokens must NEVER be stored in `localStorage`, `sessionStorage`, or accessible JavaScript variables at rest.
7. Token refresh is automatic and silent. The SDK refreshes the access token when it is within 60 seconds of expiry.
8. Given Keycloak is unreachable during a token refresh, the SDK retries 3 times with exponential backoff (1s, 2s, 4s). If all retries fail, it calls `onAuthError` and redirects to `/login`.
9. The SDK includes a `docker-compose.yml` for local development that starts: Keycloak (pre-configured with a dev realm), PostgreSQL, and a seed script creating test users with all roles.
10. Documentation: A 5-page integration guide covering: installation, minimal setup, protecting routes, accessing user data, and customization.

---

### FR17: Admin Console -- User Management

**Priority:** P0
**Personas:** James Park (Admin)
**HIPAA Mapping:** 164.312(a)(1) -- Access Control; 164.308(a)(3) -- Workforce Security

**Description:**
Administrators access user management through the Keycloak admin console (themed to match HealthGate's visual identity). The admin console provides full user lifecycle management: creation, search, role assignment, MFA management, account enable/disable, and session management.

**Acceptance Criteria:**
1. James Park can search users by: name, email, role, account status (active/locked/disabled), MFA enrollment status, and last login date.
2. James Park can create new users, specifying: name, email, initial realm roles, and whether a password setup email is sent.
3. James Park can view a user's detail page showing: profile information, assigned roles (realm + client), active sessions (with device/IP/last activity), MFA enrollment status, login history (last 10 events), and account status.
4. James Park can disable a user account. Disabling immediately terminates all active sessions (FR8) and prevents future login. The user is NOT deleted -- their audit trail is preserved.
5. James Park can re-enable a previously disabled account.
6. James Park can reset a user's MFA enrollment, forcing the user to re-enroll on next login. This is used when a user loses their MFA device.
7. James Park can assign and remove both realm roles and client roles for any user.
8. James Park can view organization-wide statistics: total users, active sessions, locked accounts, MFA enrollment rate (percentage), failed login attempts (last 24h, last 7d, last 30d).
9. All admin actions are audit-logged per FR14.

---

### FR18: Admin Console -- Policy Management

**Priority:** P1
**Personas:** James Park (Admin), Dr. Robert Kim (CISO)
**HIPAA Mapping:** 164.308(a)(1) -- Security Management Process

**Description:**
Administrators can configure authentication policies at the realm level without requiring engineering changes. Policies include session timeouts, password rules, MFA enforcement, and lockout thresholds.

**Acceptance Criteria:**
1. Configurable policies (via Keycloak realm settings):

| Policy | Default | Configurable Range |
|---|---|---|
| Idle timeout | 15 minutes | 5-60 minutes |
| Max session lifetime | 12 hours (clinician), 30 min (patient) | 15 min - 24 hours |
| Session warning lead time | 2 minutes | 1-5 minutes |
| Min password length | 12 characters | 8-128 characters |
| Password history | 12 passwords | 1-24 passwords |
| Password max age | 365 days | 30-730 days |
| Failed login threshold | 5 attempts | 3-10 attempts |
| Lockout duration | 15 minutes | 5-60 minutes |
| MFA enforcement | Required for all | Required / Optional per role |

2. Policy changes take effect for new sessions immediately. Existing sessions continue under the previous policy until they expire or are refreshed.
3. Given Dr. Robert Kim requests stricter policies, when James Park updates the idle timeout from 15 to 10 minutes, then all new sessions created after the change use the 10-minute idle timeout.
4. Policy change events are audit-logged: `event_type: POLICY_CHANGE`, including `admin_user_id`, `policy_name`, `old_value`, `new_value`, `timestamp`.

---

### FR19: Admin Console -- Compliance Reports

**Priority:** P1
**Personas:** Dr. Robert Kim (CISO), James Park (Admin)
**HIPAA Mapping:** 164.312(b) -- Audit Controls; 164.308(a)(1)(ii)(D) -- Information System Activity Review

**Description:**
The admin console provides pre-built compliance report templates that Dr. Robert Kim can generate on-demand for HIPAA audits, OCR investigations, and quarterly board presentations.

**Acceptance Criteria:**
1. Available report templates:

| Report | Contents |
|---|---|
| **Access Audit Report** | All login/logout events for a specified date range, filterable by user/app/role |
| **Failed Authentication Report** | All failed login attempts, including locked accounts, for a specified date range |
| **MFA Enrollment Report** | Percentage of users with MFA enabled, broken down by realm and role |
| **Session Policy Compliance** | Verification that all active sessions respect configured timeout policies |
| **User Lifecycle Report** | All user creation, disable, enable, and role-change events for a specified date range |
| **HIPAA Control Mapping** | Matrix of HIPAA 164.312 controls to HealthGate features with current compliance status |

2. Reports are exportable in PDF and CSV formats.
3. Reports can be scheduled for automatic generation (daily, weekly, monthly) and delivered via email.
4. Given Dr. Robert Kim needs to respond to an OCR investigation, when he generates an Access Audit Report filtered to a specific user and date range, then the report is ready within 30 seconds for date ranges up to 90 days.
5. The HIPAA Control Mapping report includes a compliance status for each control: "Compliant" (green), "Partially Compliant" (yellow), "Non-Compliant" (red), with evidence links.

---

### FR20: Error Handling -- No Information Leakage

**Priority:** P0
**Personas:** All users, Dr. Robert Kim (CISO)
**HIPAA Mapping:** 164.312(d) -- Person or Entity Authentication; 164.312(a)(1) -- Access Control

**Description:**
All error messages displayed to users must be generic and must not reveal information about the system's internal state, database contents, user existence, or specific failure reasons that could aid an attacker.

**Acceptance Criteria:**
1. The following error message mappings are enforced (no exceptions):

| Internal Condition | User-Facing Message |
|---|---|
| Invalid password for existing user | "Invalid email or password" |
| Email not found in database | "Invalid email or password" |
| Account disabled by admin | "Invalid email or password" |
| Account locked (brute force) | "Account temporarily locked" (redirect to `/account-locked`) |
| Invalid MFA code | "Unable to verify. Please try again." |
| Expired MFA code | "Unable to verify. Please try again." |
| Password reset for unregistered email | "If an account exists with that email, you'll receive a password reset link shortly." |
| Registration with existing email | "Unable to create account. Please try again or sign in." |
| Expired reset token | "This reset link has expired or has already been used." |
| Server error (5xx) | "Something went wrong. Please try again later." (toast) |
| Rate limited (429) | "Too many requests. Please wait a moment and try again." (toast) |

2. HTTP error responses from Keycloak are intercepted by the Next.js BFF (Backend for Frontend) layer. Raw Keycloak error codes and stack traces are NEVER forwarded to the browser.
3. Given any unhandled exception occurs in the authentication flow, then the system displays: "Something went wrong. Please try again later." and logs the full error details server-side with a `correlation_id` that can be used for investigation.
4. HTML source code, JavaScript bundles, and network responses must not contain: Keycloak version numbers, database type/version, internal hostnames, stack traces, or SQL error fragments.

---

### FR21: Remember Device (Trusted Device)

**Priority:** P1
**Personas:** Maria Rodriguez (Patient)
**HIPAA Mapping:** 164.312(d) -- Person or Entity Authentication

**Description:**
On personal devices, users can opt to "remember this device" to skip MFA on subsequent logins from the same device. This is particularly important for Maria Rodriguez, who logs in from her personal iPhone and laptop and finds MFA setup confusing.

**Acceptance Criteria:**
1. A checkbox labeled "Remember this device" appears on the MFA challenge screen (S3), unchecked by default.
2. Given a user checks "Remember this device" and completes MFA successfully, then a device trust cookie is set with a 30-day expiration.
3. Given a user logs in from a remembered device within 30 days, when they enter correct credentials, then the MFA step is skipped.
4. The device trust cookie is: HttpOnly, Secure, SameSite=Strict, and contains a cryptographic device fingerprint (hashed combination of user ID + device identifier).
5. James Park can disable "Remember this device" functionality globally or per-realm via policy configuration (FR18). Default: enabled for patient realm, disabled for clinician realm (shared workstations).
6. A user can view and revoke trusted devices from their account settings. The list shows: device name (user agent description), date trusted, and a "Remove" action.
7. Given a user's password is changed or reset, then all trusted device cookies for that user are invalidated.

---

### FR22: New Device / New Location Notification

**Priority:** P1
**Personas:** Maria Rodriguez (Patient), Dr. Robert Kim (CISO)
**HIPAA Mapping:** 164.312(b) -- Audit Controls

**Description:**
Users receive an email notification when their account is accessed from a previously unseen device or IP address. This provides an early warning for account compromise.

**Acceptance Criteria:**
1. Given a user logs in from a new device (user agent not previously associated with their account) or new IP address, then an email is sent within 60 seconds containing: "New sign-in to your HealthGate account", device description (e.g., "Chrome on Windows"), approximate location (city, country, derived from IP geolocation), date and time, and a "Not you? Secure your account" link leading to password change.
2. "New" is defined as: the combination of user agent family + IP /24 subnet has not been seen in the last 90 days of login history for that user.
3. The notification email does NOT contain any PHI -- only authentication metadata.
4. This feature can be disabled per-user in account settings (opt-out).

---

### FR23: SCIM Provisioning (Automated User Lifecycle)

**Priority:** P2
**Personas:** James Park (Admin)
**HIPAA Mapping:** 164.308(a)(3)(ii)(C) -- Termination Procedures

**Description:**
HealthGate supports SCIM 2.0 (System for Cross-domain Identity Management) for automated user provisioning and deprovisioning from enterprise HR systems or identity governance platforms.

**Acceptance Criteria:**
1. Keycloak exposes a SCIM 2.0 endpoint (via the keycloak-scim extension) supporting: `Users` resource type with CRUD operations, `Groups` resource type mapped to Keycloak roles, and filtering by `userName`, `email`, `active`.
2. Given an employee is terminated in the HR system, when the HR system sends a SCIM PATCH setting `active: false`, then the Keycloak user is disabled and all active sessions are terminated within 60 seconds.
3. Given a new employee is added in the HR system, when the HR system sends a SCIM POST, then a Keycloak user is created with appropriate realm roles based on SCIM group membership.
4. SCIM operations are audit-logged: `event_type: SCIM_USER_CREATED`, `SCIM_USER_UPDATED`, `SCIM_USER_DISABLED`.
5. SCIM endpoint is authenticated via bearer token with a dedicated service account.

---

### FR24: WebAuthn / FIDO2 Support (Passwordless Readiness)

**Priority:** P2
**Personas:** Dr. Sarah Chen (Clinician)
**HIPAA Mapping:** 164.312(d) -- Person or Entity Authentication

**Description:**
HealthGate supports WebAuthn/FIDO2 as an alternative MFA method, laying the groundwork for future passwordless authentication. This addresses clinician needs for fast, phone-free authentication.

**Acceptance Criteria:**
1. Users can register a WebAuthn security key (e.g., YubiKey) or platform authenticator (e.g., Touch ID, Windows Hello) as an MFA method in addition to or instead of TOTP.
2. The MFA challenge screen (S3) detects registered WebAuthn credentials and prompts for them before falling back to TOTP.
3. WebAuthn registration and authentication are handled by Keycloak's built-in WebAuthn support.
4. Given a user has both TOTP and WebAuthn configured, when they reach the MFA challenge, then WebAuthn is attempted first with a fallback link: "Use authenticator app instead."
5. WebAuthn events are audit-logged: `event_type: WEBAUTHN_REGISTER`, `WEBAUTHN_AUTH_SUCCESS`, `WEBAUTHN_AUTH_FAILURE`.

---

### FR25: Internationalization Readiness (i18n)

**Priority:** P2
**Personas:** Maria Rodriguez (Patient)
**HIPAA Mapping:** N/A

**Description:**
HealthGate's UI supports internationalization for all user-facing strings, enabling future translation without code changes. V1 ships in English only, but the architecture supports additional languages.

**Acceptance Criteria:**
1. All user-facing strings are externalized into a locale file (`en.json`), not hardcoded in components.
2. Date/time formatting respects the user's browser locale via the `Intl` API.
3. The system uses `next-intl` or equivalent Next.js i18n library.
4. RTL (right-to-left) layout support is not required for V1 but the CSS architecture must not preclude it.

---

## 2. Non-Functional Requirements

### NFR1: Performance

| Metric | Target | Measurement Method |
|---|---|---|
| Login page load time (p50) | < 500ms | Lighthouse, Synthetic monitoring from US-East, US-West |
| Login page load time (p95) | < 1,000ms | Same |
| Authentication latency (credential check + MFA, p50) | < 800ms | Server-side instrumentation, Keycloak to redirect complete |
| Authentication latency (p95) | < 2,000ms | Same |
| Token refresh latency (p95) | < 200ms | Client-side instrumentation, SDK timer |
| Concurrent authenticated sessions | 50,000 minimum | Load testing with k6 or Locust |
| Login throughput | 500 logins/second sustained | Load testing |
| Keycloak API response time (p95) | < 100ms | APM (Application Performance Monitoring) |
| SDK bundle size (gzipped) | < 30 KB | Webpack bundle analyzer |
| Time to Interactive (Login page) | < 2 seconds on 3G | Lighthouse throttled |

---

### NFR2: Security

| Requirement | Specification |
|---|---|
| **TLS** | TLS 1.2 minimum, TLS 1.3 preferred. Cipher suites: `TLS_AES_256_GCM_SHA384`, `TLS_CHACHA20_POLY1305_SHA256`, `TLS_AES_128_GCM_SHA256`. No CBC suites. No SSLv3/TLS 1.0/1.1. |
| **Access Token Format** | JWT (JWS), signed with RS256 (RSA 2048-bit key). Contains: `sub`, `iss`, `aud`, `exp`, `iat`, `auth_time`, `realm_access`, `resource_access`, `session_state`. |
| **Access Token Lifetime** | 5 minutes (300 seconds). |
| **Refresh Token Lifetime** | Configurable per-realm. Default: 8 hours (clinician), 30 minutes (patient). |
| **Refresh Token Rotation** | Enabled. Each refresh generates a new refresh token. Previous refresh token is invalidated. |
| **Token Storage (Client)** | HttpOnly, Secure, SameSite=Strict cookies. Access token in one cookie, refresh token in another. NEVER in localStorage, sessionStorage, or JavaScript-accessible memory at rest. |
| **Cookie Configuration** | `Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age={token_lifetime}` |
| **CSRF Protection** | Double-submit cookie pattern. All state-changing requests include a CSRF token validated server-side. |
| **CORS** | Allowlist of registered application origins only. No wildcards. `Access-Control-Allow-Credentials: true` only for allowlisted origins. |
| **Key Rotation** | Keycloak signing keys rotated every 90 days. Previous key remains valid for 30 days after rotation (grace period for in-flight tokens). |
| **Encryption at Rest** | PostgreSQL database encrypted via dm-crypt/LUKS (or cloud-native encryption). AES-256. |
| **Encryption in Transit** | All inter-service communication (Next.js to Keycloak, Keycloak to PostgreSQL) over TLS 1.2+. |
| **Secrets Management** | All secrets (DB passwords, Keycloak admin credentials, signing keys) stored in HashiCorp Vault or Kubernetes Secrets (encrypted etcd). Never in environment variables, config files, or source code. |
| **Penetration Testing** | Quarterly, performed by an independent third party. All findings remediated within: Critical (24h), High (7d), Medium (30d), Low (90d). |

---

### NFR3: Accessibility

| Requirement | Standard |
|---|---|
| **WCAG Level** | 2.1 AA compliance for all authentication screens |
| **Color Contrast** | Minimum 4.5:1 for normal text, 3:1 for large text (18px+ or 14px+ bold) |
| **Focus Indicators** | 2px ring in `--ring` (#d97757) with 2px offset on all interactive elements. Must meet 3:1 contrast against background. |
| **Keyboard Navigation** | Full functionality via keyboard only. Tab order: email field, password field, forgot password link, continue button, SSO button, register link. No tab traps. |
| **Screen Reader** | All inputs have `<label>` elements. Errors use `aria-describedby`. Loading states use `aria-live="polite"`. Password toggle has `aria-label`. OTP inputs have `aria-label="Digit X of 6"`. |
| **Error Identification** | Inputs with errors have `aria-invalid="true"`. Error messages are programmatically associated via `aria-describedby`. |
| **Autofill** | Correct `autocomplete` attributes on all fields (FR1, FR2). |
| **Motion** | All animations respect `prefers-reduced-motion: reduce`. |
| **Zoom** | Layout functions correctly at 200% zoom without horizontal scroll. |
| **Touch Targets** | Minimum 44x44px for all interactive elements (WCAG 2.1 AAA target, adopted as AA floor for healthcare). |
| **Language** | `<html lang="en">` set on all pages. |

---

### NFR4: Reliability

| Metric | Target |
|---|---|
| **Uptime SLA** | 99.95% measured monthly (allows ~22 minutes downtime/month) |
| **Error Budget** | 0.05% (21.6 minutes/month). Exceeding error budget triggers a deployment freeze until a post-mortem is completed. |
| **Recovery Time Objective (RTO)** | 15 minutes for Zone 1 (Auth Plane) |
| **Recovery Point Objective (RPO)** | 1 minute (maximum data loss window) |
| **Keycloak High Availability** | Minimum 2 Keycloak replicas in active-active configuration behind a load balancer. Session state replicated via Infinispan distributed cache. |
| **PostgreSQL High Availability** | Primary + synchronous standby replica. Automatic failover via Patroni or cloud-native HA (e.g., Cloud SQL HA). |
| **Failover Behavior** | Given the Keycloak primary fails, when the load balancer detects failure (health check interval: 5 seconds, unhealthy threshold: 3 checks), then traffic is routed to the surviving replica. Users with active sessions experience no interruption. Users attempting to login experience < 15 seconds of degraded service. |
| **Graceful Degradation** | If Keycloak is entirely unreachable, the Gateway (Zone 2) continues to validate existing access tokens using cached JWKS (JSON Web Key Set). New logins are unavailable but existing sessions persist until token expiry. |
| **Backup** | Full PostgreSQL backup every 6 hours. WAL (Write-Ahead Log) archiving for point-in-time recovery. Backups encrypted at rest (AES-256) and tested monthly. |

---

### NFR5: Scalability

| Dimension | Specification |
|---|---|
| **Horizontal Scaling (Keycloak)** | Add Keycloak replicas behind the load balancer. No session affinity required (Infinispan distributed cache). Target: linear throughput scaling up to 10 replicas. |
| **Horizontal Scaling (Next.js)** | Stateless Next.js instances behind a load balancer. Scale based on CPU/memory thresholds. Target: 50 replicas. |
| **Database Scaling** | Vertical scaling initially. Read replicas for reporting queries (admin console, audit log search). Write operations remain on primary. |
| **Connection Pooling** | PgBouncer in front of PostgreSQL. Max connections: 200 per Keycloak replica. Connection pool mode: transaction. |
| **CDN** | Static assets (CSS, JS, fonts, images) served from CDN. Login page HTML is NOT cached (dynamic per-request). |
| **Multi-Region** | Not required for V1. Architecture must not preclude future multi-region deployment with read replicas. |

---

### NFR6: Compliance

| Control (HIPAA 164.xxx) | HealthGate Implementation | Verification Method |
|---|---|---|
| **164.312(a)(1)** -- Access Control | Keycloak RBAC (FR13), session management (FR7), forced logout (FR8) | Penetration test, policy audit |
| **164.312(a)(2)(i)** -- Unique User ID | UUID per user (FR2), no shared accounts | User database audit |
| **164.312(a)(2)(ii)** -- Emergency Access | Break-glass procedure documented; admin can elevate roles in emergency | Tabletop exercise |
| **164.312(a)(2)(iii)** -- Automatic Logoff | Idle + max timeout (FR7) | Automated test, session audit |
| **164.312(a)(2)(iv)** -- Encryption/Decryption | AES-256 at rest, TLS 1.2+ in transit (NFR2) | Configuration audit, TLS scan |
| **164.312(b)** -- Audit Controls | Comprehensive audit logging (FR14), 6-year retention, tamper evidence | Log integrity verification |
| **164.312(c)(1)** -- Integrity | Token signatures (RS256), hash chain on audit logs | Cryptographic verification |
| **164.312(c)(2)** -- Mechanism to Authenticate ePHI | N/A -- HealthGate stores zero PHI (3-Zone model) | Architecture review |
| **164.312(d)** -- Person/Entity Authentication | Email+password+MFA (FR1, FR5), SAML federation (FR4) | Authentication flow audit |
| **164.312(e)(1)** -- Transmission Security | TLS 1.2+ everywhere, HSTS header (FR15) | TLS scan, header audit |
| **164.312(e)(2)(i)** -- Integrity Controls | TLS provides integrity in transit | TLS scan |
| **164.312(e)(2)(ii)** -- Encryption | TLS 1.2+ with strong cipher suites (NFR2) | Cipher suite audit |
| **164.308(a)(1)(ii)(D)** -- Activity Review | Audit log review capability (FR19), SIEM integration (FR14) | Compliance report generation |
| **164.308(a)(3)(ii)(C)** -- Termination | Admin session termination (FR8), SCIM deprovisioning (FR23) | Termination procedure test |
| **164.308(a)(4)** -- Information Access Mgmt | RBAC with per-app roles (FR13), policy management (FR18) | Role assignment audit |
| **164.308(a)(5)(ii)(D)** -- Password Mgmt | Password policy (FR9), reset (FR10), change (FR11) | Policy configuration audit |

---

### NFR7: Observability

| Dimension | Specification |
|---|---|
| **Metrics** | Prometheus-format metrics exposed by Keycloak (`/metrics`) and Next.js (custom). Key metrics: `login_total` (counter, by result), `login_duration_seconds` (histogram), `active_sessions` (gauge), `token_refresh_total` (counter), `mfa_challenge_total` (counter, by result), `account_lockout_total` (counter), `keycloak_health` (gauge). |
| **Logging** | Structured JSON logs (see FR14 for audit events). Application logs include: `timestamp`, `level`, `message`, `correlation_id`, `service`, `environment`. Log levels: ERROR, WARN, INFO, DEBUG (DEBUG disabled in production). |
| **Tracing** | OpenTelemetry distributed tracing across Next.js, Keycloak, and PostgreSQL. Trace ID propagated via `traceparent` header. Sampling rate: 10% in production, 100% in staging. |
| **Dashboards** | Grafana dashboards for: (1) Auth Overview (login rate, failure rate, latency percentiles), (2) Session Management (active sessions, timeouts, extensions), (3) Security (lockouts, suspicious IPs, MFA failures), (4) Infrastructure (CPU, memory, DB connections, request queue depth). |
| **Alerting** | PagerDuty integration. Critical alerts (page on-call): login failure rate > 10% for 5 minutes, Keycloak replica down, DB failover triggered, 0 successful logins for 2 minutes. Warning alerts (Slack): elevated lockout rate, certificate expiry < 30 days, disk usage > 80%. |
| **Health Checks** | `/healthz` (liveness): returns 200 if process is running. `/readyz` (readiness): returns 200 if Keycloak is reachable and DB connection pool has available connections. Used by Kubernetes probes. |

---

### NFR8: Deployment

| Dimension | Specification |
|---|---|
| **Containerization** | All services (Next.js, Keycloak) run as Docker containers with non-root users, read-only filesystems, and no unnecessary capabilities. |
| **Orchestration** | Kubernetes (GKE or EKS). Namespaces: `healthgate-prod`, `healthgate-staging`, `healthgate-dev`. |
| **CI/CD** | GitHub Actions or Cloud Build. Pipeline: lint, unit test, integration test, security scan (Snyk/Trivy), build, push, deploy to staging, smoke test, deploy to production (canary, then full rollout). |
| **Rollback** | One-command rollback to previous version via `kubectl rollout undo` or deployment pipeline revert. Max rollback time: 5 minutes. |
| **Infrastructure as Code** | Terraform for cloud infrastructure. Helm charts for Kubernetes resources. All configuration version-controlled. |
| **Environment Parity** | Dev, staging, and production environments are architecturally identical. Staging mirrors production data volume (anonymized). |
| **Database Migrations** | Flyway or Liquibase for schema versioning. Migrations are forward-only (no destructive rollbacks in production). All migrations tested in staging before production. |

---

### NFR9: Data Residency & Privacy

| Requirement | Specification |
|---|---|
| **PHI Isolation** | Zone 1 (Auth Plane) stores ZERO PHI. Verified by automated scanning of the auth database schema: no columns named or aliased to contain diagnosis, medication, treatment, SSN, or any of the 18 HIPAA identifiers beyond what is necessary for authentication (name, email). |
| **Data Classification** | Auth database columns classified as: PII (name, email), Security (hashed password, MFA secret, session ID), Operational (timestamps, IP addresses, user agents). |
| **Data Retention** | User accounts: retained until explicitly deleted by admin or user request. Audit logs: 6 years 210 days (FR14). Session data: deleted upon session termination. |
| **Right to Deletion** | Admin can delete a user account. Deletion anonymizes PII in audit logs (replaces name/email with `[DELETED_USER:{uuid}]`) while retaining the audit trail structure per HIPAA requirements. |

---

### NFR10: Browser Support

| Browser | Minimum Version |
|---|---|
| Chrome | Latest 2 major versions |
| Firefox | Latest 2 major versions |
| Safari | Latest 2 major versions (macOS + iOS) |
| Edge | Latest 2 major versions |
| Samsung Internet | Latest major version |
| Internet Explorer | NOT SUPPORTED |

All authentication flows must function without JavaScript disabled, via server-side rendered fallback forms (progressive enhancement).

---

### NFR11: Load Testing Requirements

| Test Type | Scenario | Success Criteria |
|---|---|---|
| **Baseline** | 100 concurrent users, sustained 10 minutes | p95 login < 2s, 0 errors |
| **Peak** | 1,000 concurrent users, sustained 5 minutes | p95 login < 3s, error rate < 0.1% |
| **Stress** | Ramp to 5,000 concurrent users over 10 minutes | System degrades gracefully (no crashes), error rate < 1%, recovery within 2 minutes after load drops |
| **Soak** | 500 concurrent users, sustained 4 hours | No memory leaks, no connection pool exhaustion, p95 stable |
| **Failover** | Kill Keycloak primary during 500 concurrent users | Recovery < 15 seconds, existing sessions unaffected, new logins resume within 15s |

---

### NFR12: Documentation

| Document | Audience | Contents |
|---|---|---|
| **Integration Guide** | Developers (Priya Patel) | 5 pages: install, configure, protect routes, access user data, customize. Working code examples. |
| **API Reference** | Developers | Full TypeScript API docs for `@healthgate/react`. Generated from JSDoc/TSDoc. |
| **Admin Guide** | IT Admins (James Park) | User management, policy configuration, report generation, troubleshooting. |
| **Security Architecture** | CISO (Dr. Robert Kim) | 3-Zone model, threat model, HIPAA control mapping, penetration test schedule. |
| **Runbook** | Platform Engineering | Deployment, monitoring, alerting, incident response, backup/restore, key rotation. |
| **HIPAA Compliance Package** | Auditors | Control mapping matrix, evidence collection guide, report templates. |

---

## 3. User Stories

### Persona: Dr. Sarah Chen (Clinician)

**US-C1: SSO Across Applications**
As Dr. Sarah Chen, I want to sign in once and access all Google Health applications without re-authenticating, so that I can focus on patient care instead of managing multiple logins.

Priority: P0
Linked FRs: FR1, FR4, FR7

Acceptance Criteria:
- Given Sarah has authenticated to the Clinical Decision Support app via HealthGate, when she navigates to the Lab Results Viewer app, then she is automatically authenticated without seeing a login screen.
- Given Sarah's SSO session is active, when she opens a third Health app in a new browser tab, then she is authenticated within 2 seconds.
- Given Sarah logs out of any one app, when she navigates to another app, then she is prompted to log in again (SSO session terminated).

**US-C2: Session Extension During Active Work**
As Dr. Sarah Chen, I want to receive a warning before my session expires and extend it with one click, so that I don't lose my work during active patient charting.

Priority: P0
Linked FRs: FR7

Acceptance Criteria:
- Given Sarah has been inactive for 13 minutes, when the session warning appears, then she sees a modal with a live countdown and a "Stay in" button.
- Given Sarah clicks "Stay in", when the button is pressed, then the idle timer resets to 15 minutes and the modal closes.
- Given Sarah is actively typing when the idle timeout approaches, when she interacts with the page, then the idle timer resets and no warning appears.

**US-C3: Fast MFA Without Phone**
As Dr. Sarah Chen, I want to authenticate using a hardware security key instead of my phone, so that I can complete MFA quickly in clinical settings where pulling out my phone is impractical.

Priority: P2
Linked FRs: FR24

Acceptance Criteria:
- Given Sarah has registered a YubiKey, when she reaches the MFA challenge, then the browser prompts for her security key automatically.
- Given Sarah taps her YubiKey, when the WebAuthn challenge completes, then she is fully authenticated within 3 seconds total.
- Given Sarah does not have her YubiKey, when she clicks "Use authenticator app instead", then she can enter a TOTP code as fallback.

---

### Persona: Maria Rodriguez (Patient)

**US-P1: Simple Account Registration**
As Maria Rodriguez, I want to create an account with a simple, guided process, so that I can access my health information without feeling overwhelmed by technology.

Priority: P0
Linked FRs: FR2, FR6

Acceptance Criteria:
- Given Maria navigates to the registration page, when the page loads, then she sees a clear form with four fields (name, email, password, confirm password) and plain-language instructions.
- Given Maria enters a password that doesn't meet requirements, when she moves to the next field, then she sees specific feedback (e.g., "Password needs at least 12 characters") in plain language.
- Given Maria completes registration, when she is redirected to MFA setup, then the instructions explain what an authenticator app is and name specific apps (Google Authenticator, Authy) with jargon-free language.

**US-P2: Password Reset Without Frustration**
As Maria Rodriguez, I want to reset my password easily when I forget it, so that I can regain access to my health portal without calling a help desk.

Priority: P0
Linked FRs: FR10

Acceptance Criteria:
- Given Maria clicks "Forgot password?" on the login page, when the forgot-password page loads, then she sees a single email field and a clear instruction: "Enter the email address associated with your account."
- Given Maria enters her email and clicks "Send reset link", when the request is processed, then she sees a confirmation message within 3 seconds.
- Given Maria receives the reset email, when she clicks the "Reset password" button, then she is taken directly to a form to enter her new password.
- Given Maria's reset email went to spam, when 5 minutes pass without action, then nothing changes (no automatic follow-up -- but the confirmation page suggests checking spam).

**US-P3: Remember My Personal Device**
As Maria Rodriguez, I want my personal phone and laptop to be remembered, so that I don't have to enter an MFA code every time I check my lab results.

Priority: P1
Linked FRs: FR21

Acceptance Criteria:
- Given Maria is on the MFA challenge screen, when she sees the "Remember this device" checkbox, then the checkbox label reads "Remember this device for 30 days."
- Given Maria checks the box and completes MFA, when she logs in again the next day from the same device, then she goes directly from password to the dashboard without an MFA prompt.
- Given Maria's password is reset, when she logs in from a previously remembered device, then she is prompted for MFA again (trust revoked).

**US-P4: New Device Login Alert**
As Maria Rodriguez, I want to be notified when someone logs into my account from a new device, so that I know if my health information might be compromised.

Priority: P1
Linked FRs: FR22

Acceptance Criteria:
- Given Maria logs in from her new tablet for the first time, when the login succeeds, then she receives an email within 60 seconds describing the device and location.
- Given the email says "Chrome on iPad, San Jose, CA", when Maria recognizes the activity, then she can ignore the email.
- Given Maria receives a notification for a device she doesn't recognize, when she clicks "Not you? Secure your account", then she is taken to the password change page.

---

### Persona: James Park (IT Administrator)

**US-A1: Centralized User Search and Management**
As James Park, I want to search for any user across all Health applications from a single admin console, so that I can quickly investigate access issues and manage the user lifecycle.

Priority: P0
Linked FRs: FR17

Acceptance Criteria:
- Given James opens the admin console and enters a user's email in the search bar, when results appear, then he sees the user's profile, roles (realm and per-app), active sessions, MFA status, and last login -- all on one page.
- Given James searches by role "clinician", when results load, then all users with the clinician realm role are listed, sortable by last login date.

**US-A2: Immediate User Termination**
As James Park, I want to disable a terminated employee's access across all Health applications in under 60 seconds, so that I meet the HIPAA requirement for timely access revocation.

Priority: P0
Linked FRs: FR8, FR17

Acceptance Criteria:
- Given James navigates to a user's profile in the admin console, when he clicks "Disable account", then the account is disabled AND all active sessions are terminated within 30 seconds.
- Given the disabled user attempts to log in, when they submit credentials, then they see "Invalid email or password" (generic -- does not confirm the account is disabled).
- Given James needs to disable multiple users (e.g., department layoff), when he selects 10 users and clicks "Disable selected", then all 10 accounts are disabled and sessions terminated within 60 seconds.

**US-A3: MFA Enrollment Dashboard**
As James Park, I want to see what percentage of users have enrolled in MFA, so that I can report compliance to the CISO and identify users who need outreach.

Priority: P1
Linked FRs: FR17, FR19

Acceptance Criteria:
- Given James opens the admin dashboard, when the statistics panel loads, then he sees "MFA Enrollment: X%" broken down by realm (clinician: Y%, patient: Z%).
- Given the MFA enrollment rate for clinicians is below 100%, when James clicks on the non-enrolled segment, then he sees a list of clinicians without MFA, filterable by department and last login.

**US-A4: Policy Configuration Without Engineering**
As James Park, I want to change authentication policies (session timeout, password rules, lockout thresholds) from the admin console without submitting an engineering ticket, so that I can respond quickly to security requirements.

Priority: P1
Linked FRs: FR18

Acceptance Criteria:
- Given James navigates to realm settings, when he changes the idle timeout from 15 to 10 minutes and clicks "Save", then the change takes effect for all new sessions immediately.
- Given James saves a policy change, when the change is processed, then an audit log entry records: who changed it, what changed, old value, and new value.

---

### Persona: Priya Patel (Developer)

**US-D1: Sub-Day Integration**
As Priya Patel, I want to add authentication to my React application in under 8 hours, so that I can focus on building clinical features instead of security infrastructure.

Priority: P0
Linked FRs: FR16

Acceptance Criteria:
- Given Priya runs `npm install @healthgate/react`, when the package installs, then it adds < 30 KB (gzipped) to her bundle.
- Given Priya wraps her app in `<HealthGateProvider>` and her routes in `<ProtectedRoute>`, when she runs the application, then unauthenticated users are redirected to the HealthGate login page.
- Given Priya's setup requires no custom authentication code, when she completes integration, then login, MFA, session management, and logout work without any additional implementation.
- Given Priya completes integration, when she checks the audit logs, then all authentication events for her application are visible in the centralized audit system without any additional instrumentation.

**US-D2: Local Development Setup**
As Priya Patel, I want a `docker-compose up` command that gives me a fully configured local auth environment, so that I can develop and test authentication flows without VPN access or shared staging environments.

Priority: P0
Linked FRs: FR16

Acceptance Criteria:
- Given Priya clones the HealthGate SDK repository and runs `docker-compose up`, when the containers start, then Keycloak is available at `localhost:8080` with a pre-configured dev realm.
- Given the dev realm is initialized, when Priya logs in with test credentials (`test@example.com` / `Test1234!@#$`), then she receives valid tokens and can access protected routes.
- Given Priya needs to test MFA, when she uses the test user with MFA enabled, then the TOTP secret for the test user is documented and a QR code is pre-generated.
- The entire local stack starts in under 60 seconds on a machine with 16 GB RAM.

**US-D3: Role-Based UI Rendering**
As Priya Patel, I want to conditionally render UI elements based on the user's roles, so that clinicians see clinical tools and admins see admin panels.

Priority: P1
Linked FRs: FR13, FR16

Acceptance Criteria:
- Given Priya uses the `useRoles()` hook, when she calls `hasRole('cds-editor')`, then it returns `true` for users with the `cds-editor` client role and `false` for others.
- Given Priya wraps a component with `<ProtectedRoute requiredRoles={['cds-admin']}>`, when a user without the `cds-admin` role navigates to that route, then they see "You don't have permission to access this page."

---

### Persona: Dr. Robert Kim (CISO)

**US-S1: Unified Audit Trail**
As Dr. Robert Kim, I want a single system that logs every authentication event across all Google Health applications, so that I can investigate security incidents without manually correlating logs from 6+ systems.

Priority: P0
Linked FRs: FR14

Acceptance Criteria:
- Given Robert queries the audit system for a specific user, when the results load, then he sees all login, logout, MFA, and session events across every integrated Health application, in chronological order, with application name, IP address, and device information.
- Given Robert needs to investigate a potential breach, when he filters by IP address and date range, then all authentication events from that IP are returned within 10 seconds.

**US-S2: HIPAA Compliance Dashboard**
As Dr. Robert Kim, I want a real-time compliance dashboard showing the status of every HIPAA authentication control, so that I can confidently report compliance to the board and respond to OCR inquiries.

Priority: P1
Linked FRs: FR19

Acceptance Criteria:
- Given Robert opens the compliance dashboard, when the page loads, then he sees a matrix of HIPAA 164.312 controls with current status: "Compliant" (green), "Partially Compliant" (yellow), or "Non-Compliant" (red).
- Given the MFA enrollment rate drops below 100% for clinicians, when the dashboard refreshes, then the MFA control shows "Partially Compliant" with the enrollment percentage and a link to the non-enrolled user list.

**US-S3: Fail-Closed Behavior Verification**
As Dr. Robert Kim, I want the authentication system to deny access on any error condition, so that a system failure never results in unauthorized access to health information.

Priority: P0
Linked FRs: FR20, NFR4

Acceptance Criteria:
- Given Keycloak returns a 500 error during token validation, when the Gateway (Zone 2) receives the error, then the request is denied (HTTP 401) and the user is redirected to the login page.
- Given the database is unreachable, when a user attempts to log in, then the login fails with "Something went wrong. Please try again later." -- access is never granted.
- Given the JWKS endpoint is unreachable, when the Gateway attempts to validate a token, then the cached JWKS is used. If no cache exists, the request is denied.

---

## 4. Edge Cases & Failure Modes

### EC1: Keycloak Service Unavailable

**Scenario:** All Keycloak replicas are down or unreachable.
**Impact:** No new logins possible. Token refresh fails.
**Behavior:**
1. Gateway (Zone 2) continues validating existing access tokens using cached JWKS (public keys). Users with valid, unexpired access tokens can continue working.
2. Token refresh requests fail. The SDK retries 3 times with exponential backoff (1s, 2s, 4s).
3. After retry exhaustion, the SDK calls `onAuthError({ code: 'KEYCLOAK_UNREACHABLE', message: 'Authentication service unavailable' })`.
4. The login page displays: "We're experiencing a temporary issue. Please try again in a few minutes." with a "Retry" button.
5. The healthcheck endpoint (`/readyz`) returns 503, triggering Kubernetes to stop routing traffic and alerting on-call.
6. Monitoring alert fires: "Critical: Keycloak unreachable for > 30 seconds" via PagerDuty.
**Recovery:** Once Keycloak recovers, no user action is required. The SDK automatically resumes token refresh on the next cycle.

### EC2: Token Refresh During Expired Session

**Scenario:** A user's access token expires and the refresh token has also expired (max session lifetime reached), but the user is still on a protected page.
**Impact:** User loses access mid-workflow.
**Behavior:**
1. The SDK detects the refresh failure (HTTP 400 from Keycloak: `invalid_grant`).
2. The SDK clears all local session state (cookies, memory).
3. The user is redirected to `/session-expired` with the message: "Your session has ended. Please sign in again."
4. The originally requested URL is preserved as a `redirect_uri` parameter so that after re-authentication, the user returns to where they left off.
5. Audit log entry: `event_type: SESSION_EXPIRED`, `reason: MAX_LIFETIME_EXCEEDED`.

### EC3: MFA Device Lost

**Scenario:** Maria Rodriguez loses her phone with the authenticator app and cannot generate TOTP codes.
**Impact:** Maria cannot complete MFA and is locked out of her account.
**Behavior:**
1. On the MFA challenge screen, Maria clicks "Can't access your code? Use a recovery code."
2. She enters one of her 5 recovery codes. The code is consumed (single-use).
3. After successful recovery code authentication, a Sonner toast warns: "Recovery code used. You have X codes remaining."
4. If Maria has no recovery codes remaining, she must contact the IT help desk.
5. James Park (Admin) can reset Maria's MFA enrollment from the admin console, which requires Maria to set up MFA again on her next login.
6. Admin MFA reset is audit-logged: `event_type: MFA_RESET`, `admin_user_id`, `target_user_id`.
**Prevention:** The MFA setup screen (FR6) requires users to confirm they've saved recovery codes via a checkbox before continuing.

### EC4: Concurrent Sessions from Multiple Devices

**Scenario:** Dr. Sarah Chen is logged in on a nursing station workstation and also logs in from her phone.
**Impact:** Multiple active sessions for the same user.
**Behavior:**
1. By default, concurrent sessions are ALLOWED. This is intentional for clinicians who may use multiple devices simultaneously.
2. Each session has independent idle and max timers.
3. Admin can configure a maximum concurrent session limit per realm. Default: unlimited for clinician realm, 3 for patient realm.
4. Given the patient realm limit is 3 and Maria attempts a 4th concurrent login, then the oldest session is terminated (FIFO eviction) and an audit entry is logged: `event_type: SESSION_EVICTED`, `reason: MAX_CONCURRENT_EXCEEDED`.
5. All concurrent sessions are visible in the admin console for each user.

### EC5: Race Condition in Session Timeout Warning

**Scenario:** The session timeout warning dialog is displayed (2 minutes remaining), and the user clicks "Stay in" at the exact moment the timer expires (or within milliseconds of it).
**Impact:** Race between the client-side timer and the server-side session state.
**Behavior:**
1. The "Stay in" button sends a session refresh request to the server.
2. If the server-side session has already expired when the refresh request arrives, Keycloak returns HTTP 400 (`invalid_grant`).
3. The SDK catches this error and treats it as a session expiration: clears local state, redirects to `/session-expired`.
4. The server is the authoritative source of session validity. The client never grants additional time unilaterally.
5. To minimize this race, the client-side timer runs 5 seconds ahead of the server-side timer (the warning shows "1:55" when the server has 2:00 remaining).

### EC6: Network Failure During OIDC Callback

**Scenario:** After the user authenticates at Keycloak, the browser redirect back to the application (OIDC callback with authorization code) fails due to network interruption.
**Impact:** User is stuck in a limbo state -- authenticated at Keycloak but the application has not received tokens.
**Behavior:**
1. The OIDC callback URL includes a `state` parameter that maps to a PKCE code verifier stored in a short-lived, HttpOnly cookie (valid for 5 minutes).
2. If the callback fails (page does not load), the user can simply navigate to the application again. The application detects the absence of tokens and redirects to Keycloak.
3. Keycloak recognizes the existing session and reissues an authorization code without requiring re-authentication.
4. The authorization code issued during the failed callback is single-use and expires after 60 seconds. It cannot be replayed.
5. If the `state` cookie has expired, the flow restarts from scratch (new PKCE challenge generated).

### EC7: PostgreSQL Failover During Active Login

**Scenario:** The PostgreSQL primary fails during a login attempt -- after Keycloak has validated credentials but before the session is persisted.
**Impact:** Login may fail because Keycloak cannot write the session to the database.
**Behavior:**
1. Keycloak's JDBC connection pool detects the failed primary and, via Patroni/HA configuration, switches to the standby within 10-15 seconds.
2. The login request returns an error. The user sees: "Something went wrong. Please try again later."
3. The user retries after 15-30 seconds and the login succeeds against the new primary.
4. During the failover window (~15 seconds), existing sessions relying on Infinispan cache continue working. Only new login/session-creation operations are affected.
5. Alert fires: "Warning: PostgreSQL failover triggered" via PagerDuty.

### EC8: Clock Skew in TOTP Validation

**Scenario:** The user's phone clock is 45 seconds ahead of the server's clock, causing TOTP codes to be rejected.
**Impact:** Valid TOTP codes are rejected, causing MFA failure.
**Behavior:**
1. Keycloak's TOTP validation accepts codes within a +/- 1 time-step window (each step is 30 seconds), providing a total tolerance of 90 seconds.
2. Given the user's clock is within 30 seconds of the server, TOTP always works.
3. Given the user's clock is 31-60 seconds off, TOTP works for codes from the adjacent time step.
4. Given the user's clock is more than 60 seconds off, TOTP will fail. The error message reads: "Unable to verify. Please try again." with no hint about clock skew (to avoid aiding attackers).
5. Keycloak supports configurable OTP policy look-ahead window. Default: 1 step. Maximum recommended: 2 steps (150 seconds total tolerance).
6. If a user consistently fails TOTP, the admin guide documents clock synchronization as a troubleshooting step.

### EC9: Browser Crashes During MFA Setup

**Scenario:** Maria's browser crashes after she has scanned the QR code and added the entry to her authenticator app, but before she has entered the verification code.
**Impact:** The TOTP secret exists in her authenticator app but is not yet activated in Keycloak.
**Behavior:**
1. The TOTP secret is stored in Keycloak as a pending credential, not yet active.
2. When Maria logs in again, she is redirected back to `/login/mfa-setup` with a new QR code (new secret).
3. The previous unverified secret is discarded.
4. Maria's authenticator app still has the old entry. She will need to delete it manually and re-scan the new QR code.
5. The MFA setup page includes helper text: "If you previously scanned a QR code but didn't complete setup, please remove the old entry from your authenticator app and scan this new code."

### EC10: Admin Accidentally Disables Own Account

**Scenario:** James Park disables his own admin account from the admin console.
**Impact:** The sole administrator is locked out.
**Behavior:**
1. The admin console displays a confirmation dialog when an admin attempts to disable their own account: "You are about to disable your own account. You will be logged out immediately and will not be able to log back in. Another administrator must re-enable your account. Are you sure?"
2. If there are no other active administrators in the realm, the action is blocked entirely with an error: "Cannot disable the last active administrator."
3. A break-glass procedure is documented: access the Keycloak master realm admin console (separate credentials, stored securely) to re-enable the user.

---

## 5. Dependencies & Integration Requirements

### 5.1 External Systems

| System | Version | Purpose | Integration Method | Owner |
|---|---|---|---|---|
| **Keycloak** | 24.0+ | Identity Provider, OIDC/SAML, RBAC, audit events | REST API, Admin API, OIDC protocol | HealthGate Platform Team |
| **PostgreSQL** | 16+ | Keycloak persistent storage (users, sessions, events) | JDBC (Keycloak), direct connection (migrations) | HealthGate Platform Team |
| **Elasticsearch** | 8.x | Audit log storage, search, and retention | Logstash (ingest from Keycloak event listeners), Kibana (UI) | Observability Team |
| **Logstash** | 8.x | Log pipeline from Keycloak to Elasticsearch | Keycloak custom event listener output | Observability Team |
| **Kibana** | 8.x | Audit log search UI, dashboards | Read from Elasticsearch indices | Observability Team |
| **Prometheus** | 2.x | Metrics collection | Scrape `/metrics` endpoints | Observability Team |
| **Grafana** | 10.x | Metrics dashboards, alerting | Read from Prometheus | Observability Team |
| **PagerDuty** | SaaS | Incident alerting | Grafana alerting integration | SRE Team |
| **Docker / Kubernetes** | K8s 1.28+ | Container orchestration | Helm charts, kubectl | Platform Engineering |
| **HashiCorp Vault** | 1.15+ | Secrets management | Kubernetes auth method | Security Team |
| **SMTP Service** | N/A | Password reset emails, new device notifications | Keycloak email configuration (SMTP) | IT Operations |
| **CDN** | Cloudflare / Cloud CDN | Static asset delivery | Origin pull from Next.js build output | Platform Engineering |

### 5.2 Cross-Team Dependencies

| Team | Dependency | Blocker? | Timeline |
|---|---|---|---|
| **Observability Team** | ELK stack provisioned and configured for HealthGate log indices | Yes | Must be ready before audit logging can be tested in staging |
| **Security Team** | Vault namespace and policies for HealthGate secrets | Yes | Must be ready before any deployment |
| **Security Team** | Penetration test schedule agreed | No | Must complete before production launch |
| **Platform Engineering** | Kubernetes namespace, resource quotas, network policies created | Yes | Must be ready for staging deployment |
| **Application Teams (x6)** | Integration testing with SDK, feedback on developer experience | No | Rolling after SDK alpha release |
| **Legal/Privacy** | BAA amendment to cover HealthGate as a shared auth service | Yes | Must be signed before production launch |
| **IT Operations** | SMTP relay configuration for HealthGate email domain | Yes | Must be ready for password reset testing |
| **HR Systems** | SCIM endpoint exposure for automated provisioning (FR23, P2) | No | Phase 2 |

### 5.3 API Contracts Needed

| API | Provider | Consumer | Format | Status |
|---|---|---|---|---|
| **OIDC Discovery** | Keycloak | Next.js (SDK) | `/.well-known/openid-configuration` | Available (Keycloak built-in) |
| **OIDC Authorization** | Keycloak | Browser (via SDK) | OAuth 2.0 Authorization Code + PKCE | Available (Keycloak built-in) |
| **OIDC Token** | Keycloak | Next.js BFF | POST `/token` | Available (Keycloak built-in) |
| **OIDC Userinfo** | Keycloak | Next.js BFF | GET `/userinfo` | Available (Keycloak built-in) |
| **OIDC Logout** | Keycloak | Next.js (SDK) | GET `/logout` + back-channel POST | Available (Keycloak built-in) |
| **SAML Metadata** | Keycloak | External IdPs | `/.well-known/saml-metadata` | Available (Keycloak built-in) |
| **Admin REST API** | Keycloak | Admin Console (custom views) | REST, Bearer token auth | Available (Keycloak built-in) |
| **JWKS** | Keycloak | Gateway (Zone 2) | `/.well-known/jwks.json` | Available (Keycloak built-in) |
| **Event Listener** | Keycloak | Logstash/ELK | Custom SPI (JSON over HTTP/Kafka) | Needs Development |
| **SCIM 2.0** | Keycloak (via extension) | HR Systems | SCIM REST API | Needs Configuration (Phase 2) |
| **Session Refresh** | Next.js BFF | React SDK | POST `/api/auth/refresh` | Needs Development |
| **Session Status** | Next.js BFF | React SDK | GET `/api/auth/session` | Needs Development |
| **CSRF Token** | Next.js BFF | React SDK | GET `/api/auth/csrf` | Needs Development |

### 5.4 Data Migration Considerations

| Application | Current Auth System | Migration Strategy |
|---|---|---|
| App 1 (Clinical Decision Support) | Custom JWT auth, bcrypt passwords in MongoDB | Export users + password hashes. Import into Keycloak via Admin API with `credentialData` migration. Users do NOT need to reset passwords if bcrypt format matches Keycloak's import. |
| Apps 2-6 | Varies (some custom, some Firebase Auth) | Each requires a migration playbook. Common steps: (1) Export user list, (2) Import into Keycloak, (3) Issue password reset for users with incompatible hash formats, (4) Run dual-auth period (both old and new systems accept logins) for 30 days, (5) Cut over to HealthGate-only. |
| All apps | N/A | Audit log data from legacy systems is NOT migrated into HealthGate. Legacy logs remain in their original systems for the HIPAA retention period. |

---

## 6. Out of Scope (V1)

| Feature | Reason | Planned For |
|---|---|---|
| **Passwordless authentication (badge tap, biometric-only login)** | Requires hardware procurement (readers), facilities integration, and pilot program. WebAuthn MFA (FR24) is the stepping stone. | Phase 2 (6-12 months post-launch) |
| **Shared workstation "tap-and-go" (Imprivata-like)** | Requires deep endpoint agent integration and hardware. Currently only possible via Imprivata partnership. | Phase 2 |
| **Patient identity federation across health systems** | Requires cross-organizational trust framework, legal agreements, and identity matching. Unsolved industry-wide. | Phase 3+ (12-24 months) |
| **SMS-based MFA** | SMS is vulnerable to SIM-swap attacks and SS7 interception. TOTP and WebAuthn are more secure. SMS may be offered as a P2 addition for patient convenience only, pending CISO approval. | Under evaluation |
| **Self-service user registration for clinicians** | Clinician accounts are provisioned by admins (James Park) or via SCIM (FR23). Self-registration is for patients only. | N/A (by design) |
| **Multi-region deployment** | V1 targets a single cloud region. Architecture must not preclude multi-region, but implementation is deferred. | Phase 2 |
| **Custom branding per application** | V1 uses a single HealthGate brand across all applications. Per-app theming (logo, colors) deferred. | Phase 2 |
| **Adaptive / risk-based authentication** | Step-up authentication based on risk signals (impossible travel, anomalous IP). Requires ML pipeline. | Phase 3 |
| **Social login (Google, Apple ID)** | Not appropriate for clinician realm. May be offered for patient realm in future. | Under evaluation |
| **Mobile native SDK (iOS, Android)** | V1 is web-only. Mobile apps use embedded browser (WebView) for OIDC flows. Native SDK deferred. | Phase 2 |
| **Fine-grained authorization (ABAC, Zanzibar-style)** | V1 uses RBAC. Attribute-based access control (e.g., "cardiologists can access cardiology records") is application-layer logic, not auth-layer. | Not planned for HealthGate (application responsibility) |
| **Break-glass emergency access system** | Documented as a manual procedure for V1 (admin elevates role). Automated break-glass with post-hoc audit deferred. | Phase 2 |

---

## 7. Risks & Mitigations

### Risk 1: Keycloak Operational Complexity

**Probability:** High | **Impact:** Medium
**Description:** Keycloak is a powerful but complex system. Misconfigurations (realm settings, client configurations, security policies) can introduce vulnerabilities or outages. The team may not have deep Keycloak expertise.
**Mitigation:**
1. Allocate 1 dedicated platform engineer with Keycloak expertise (or budget for training).
2. Use Infrastructure as Code (Terraform + Keycloak Terraform provider) for all configuration -- no manual admin console changes in production.
3. Create a Keycloak configuration test suite that validates security settings (MFA enforcement, token lifetimes, password policies) on every deployment.
4. Engage Red Hat consulting for an initial Keycloak architecture review before production launch.

### Risk 2: Application Team Adoption Resistance

**Probability:** Medium | **Impact:** High
**Description:** Application teams may resist migrating from their custom auth systems to HealthGate, citing: timeline risk, feature gaps, or "not invented here" syndrome.
**Mitigation:**
1. Start with the newest application (Priya Patel's Clinical Decision Support tool) as the launch partner -- no migration required, greenfield integration.
2. Publish quantitative results: integration time, lines of code saved, security posture improvement.
3. Offer a 30-day dual-auth migration period where both old and new systems accept logins.
4. VP Engineering (sponsor) mandates HealthGate adoption with a 12-month deadline for all existing apps.

### Risk 3: HIPAA Audit Failure

**Probability:** Low | **Impact:** Critical
**Description:** Despite best efforts, an OCR audit could identify gaps in HealthGate's HIPAA compliance, resulting in fines or mandatory corrective action.
**Mitigation:**
1. Engage a third-party HIPAA compliance assessor to review HealthGate before production launch.
2. Maintain the HIPAA Control Mapping report (FR19) as a living document, reviewed quarterly.
3. Automate evidence collection: the system should generate compliance evidence continuously, not just at audit time.
4. Privacy Counsel reviews all error messages, email templates, and user-facing copy for PHI leakage.

### Risk 4: Keycloak Single Point of Failure

**Probability:** Low (with HA) | **Impact:** Critical
**Description:** If Keycloak HA fails, all authentication across the entire Google Health portfolio is down.
**Mitigation:**
1. Deploy minimum 3 Keycloak replicas across 2 availability zones.
2. Implement cached JWKS in Gateway (Zone 2) so existing sessions survive Keycloak outage.
3. Monthly failover drills: intentionally kill Keycloak primary and verify automatic recovery.
4. Error budget policy: any Keycloak outage exceeding 5 minutes triggers a post-mortem with mandatory follow-up.

### Risk 5: Token Security Breach

**Probability:** Low | **Impact:** Critical
**Description:** If Keycloak's signing keys are compromised, an attacker could forge valid tokens for any user.
**Mitigation:**
1. Signing keys stored in Vault, not in Keycloak's database.
2. Key rotation every 90 days with 30-day grace period.
3. Key rotation can be triggered ad-hoc in < 5 minutes for emergency response.
4. Token validation checks `iss` (issuer), `aud` (audience), `exp` (expiration), and signature. Any mismatch = reject.
5. Monitor for anomalous token patterns (tokens with future `iat`, unknown `kid` values).

### Risk 6: SDK Adoption Friction

**Probability:** Medium | **Impact:** Medium
**Description:** Developers may find the SDK difficult to integrate, poorly documented, or incompatible with their specific Next.js/React configurations.
**Mitigation:**
1. Priya Patel's team is the design partner. Their integration experience drives SDK improvements before wider release.
2. Publish a working example repository (not just docs) with a complete Next.js app integrated with HealthGate.
3. Office hours: weekly 30-minute developer support session for the first 3 months.
4. SDK versioning follows semver. No breaking changes in minor/patch versions.

### Risk 7: Performance Degradation Under Load

**Probability:** Medium | **Impact:** High
**Description:** At 70+ logins per clinician per shift across 2,000+ users, HealthGate could experience performance bottlenecks at peak times (shift change).
**Mitigation:**
1. Load testing (NFR11) must pass before production launch. Tests model realistic clinician shift-change patterns.
2. Keycloak autoscaling: HPA (Horizontal Pod Autoscaler) configured to add replicas when CPU > 70% or request latency p95 > 1 second.
3. PgBouncer connection pooling prevents database connection exhaustion.
4. CDN for all static assets to reduce origin server load.

---

## 8. Success Criteria for PRD Sign-off

This PRD is approved for development when ALL of the following conditions are met:

### 8.1 Stakeholder Approvals

| Stakeholder | Role | Approval Criteria |
|---|---|---|
| VP Engineering | Sponsor | Confirms scope, timeline, and resource allocation are feasible |
| CISO (Dr. Robert Kim) | Security Blocker | Confirms all HIPAA 164.312 controls are mapped and the 3-Zone isolation model is sound |
| Privacy Counsel | Legal Blocker | Confirms no PHI exposure risk in auth flows, error messages, and audit logs |
| App Team Lead (1+ team) | Champion | Confirms the SDK integration approach meets developer needs and the migration strategy is viable |
| IT Security Admin (James Park) | Admin Champion | Confirms admin console requirements meet operational needs |
| UX Research Lead | UX Approval | Confirms the UX spec (05-ux-ui-design-spec.md) addresses clinician and patient usability needs |

### 8.2 Technical Readiness Criteria

| Criterion | Verification |
|---|---|
| Keycloak 24+ deployed in staging with HA configuration | Staging environment running, health checks passing |
| PostgreSQL 16 HA (primary + standby) provisioned | Failover tested successfully in staging |
| ELK stack provisioned and receiving test events | Test audit event visible in Kibana |
| Vault namespace created with HealthGate policies | Secrets retrievable from staging pods |
| Kubernetes namespace with network policies | Pod-to-pod communication verified, cross-namespace blocked |
| CI/CD pipeline functional | Push to main branch triggers build, test, deploy to staging |
| SDK alpha package published | `npm install @healthgate/react@alpha` installs successfully |

### 8.3 Definition of Done (for V1 Launch)

| Criterion | Measurable Target |
|---|---|
| All P0 FRs implemented and tested | 100% of P0 acceptance criteria pass in staging |
| All P0 NFRs met | Performance targets verified via load testing |
| Zero critical or high security findings | Penetration test completed with all critical/high findings resolved |
| HIPAA control mapping verified | Third-party compliance assessment completed |
| Integration pilot completed | At least 1 application (Priya's CDS tool) fully integrated and functional in staging |
| Documentation complete | Integration guide, admin guide, and runbook reviewed and published |
| Monitoring and alerting operational | All Grafana dashboards populated, PagerDuty alerts tested |
| Disaster recovery tested | Database failover, Keycloak failover, and rollback procedures executed successfully |
| Error budget established | 30-day baseline of production metrics before enforcing error budget policy |

### 8.4 Open Questions Requiring Resolution Before Sign-off

| # | Question | Decision Owner | Deadline |
|---|---|---|---|
| OQ1 | Should patient and clinician identities be in separate Keycloak realms or a single realm with role-based policies? (This PRD assumes separate realms -- confirm.) | CISO + Privacy Counsel | Before sprint 1 |
| OQ2 | What is the timeline pressure from the 2025 HIPAA rule finalization? Is the 180-day compliance window the hard deadline? | Privacy Counsel | Before sprint 1 |
| OQ3 | Should HealthGate support hospital AD/LDAP federation in V1 or defer to Phase 2? (This PRD includes SAML federation in V1 but defers LDAP.) | CISO + IT Admin Lead | Before sprint 2 |
| OQ4 | Do any existing applications have contractual authentication requirements (e.g., customer-mandated IdP, specific MFA method) that would conflict with HealthGate? | Legal + App Team Leads | Before sprint 1 |
| OQ5 | What is the approved SMTP relay for HealthGate transactional email (password reset, new device notifications)? | IT Operations | Before sprint 3 |
| OQ6 | Is SMS-based MFA acceptable for the patient realm, given CISO concerns about SIM-swap attacks? | CISO | Before sprint 4 |

---

## Appendix A: HIPAA Control Quick Reference

For convenience, the HIPAA Security Rule sections referenced throughout this PRD:

| Section | Title | Relevant FRs |
|---|---|---|
| 164.308(a)(1) | Security Management Process | FR18, FR19 |
| 164.308(a)(1)(ii)(D) | Information System Activity Review | FR14, FR19 |
| 164.308(a)(3) | Workforce Security | FR17 |
| 164.308(a)(3)(ii)(C) | Termination Procedures | FR8, FR23 |
| 164.308(a)(4) | Information Access Management | FR8, FR13 |
| 164.308(a)(5)(ii)(D) | Password Management | FR9, FR10, FR11 |
| 164.312(a)(1) | Access Control | FR7, FR8, FR12, FR13, FR20 |
| 164.312(a)(2)(i) | Unique User Identification | FR2, FR4 |
| 164.312(a)(2)(ii) | Emergency Access Procedure | NFR6 (documented procedure) |
| 164.312(a)(2)(iii) | Automatic Logoff | FR3, FR7 |
| 164.312(a)(2)(iv) | Encryption and Decryption | NFR2 |
| 164.312(b) | Audit Controls | FR14, FR19, FR22 |
| 164.312(c)(1) | Integrity | NFR2 (token signatures) |
| 164.312(d) | Person or Entity Authentication | FR1, FR4, FR5, FR6, FR10, FR20, FR21, FR24 |
| 164.312(e)(1) | Transmission Security | FR15, NFR2 |
| 164.312(e)(2)(i) | Integrity Controls | NFR2 |
| 164.312(e)(2)(ii) | Encryption | NFR2 |

---

## Appendix B: Screen Route Map

| Route | Screen | Auth State | FR |
|---|---|---|---|
| `/login` | Login | Unauthenticated | FR1 |
| `/register` | Register | Unauthenticated | FR2 |
| `/login/mfa` | MFA Challenge | Partially authenticated | FR5 |
| `/login/mfa-setup` | MFA Setup | Partially authenticated | FR6 |
| `/forgot-password` | Forgot Password | Unauthenticated | FR10 |
| `/reset-password` | Reset Password | Token-authenticated | FR10 |
| `/session-expired` | Session Expired | Unauthenticated | FR7 |
| `/account-locked` | Account Locked | Unauthenticated | FR12 |
| `/dashboard` | Dashboard | Authenticated | FR16 |
| (modal overlay) | Session Timeout Warning | Authenticated | FR7 |

---

### Critical Files for Implementation

Based on the discovery documents and this PRD, the following files are most critical for beginning implementation:

- `/Users/avn/Desktop/prodACA/docs/phase0-discovery/05-ux-ui-design-spec.md` - Contains the complete UX/UI specification with all 10 screens, component inventory, design tokens, interaction states, error message patterns, and accessibility requirements that directly map to FR1-FR6, FR7 (session timeout), FR10, and FR12. This is the implementation blueprint for every frontend screen.

- `/Users/avn/Desktop/prodACA/docs/phase0-discovery/02-user-personas.md` - Contains the 5 detailed personas with their specific needs, frustrations, HIPAA implications, and success criteria. Every user story and acceptance criterion in this PRD traces back to these personas. Developers need this for user empathy and prioritization context.

- `/Users/avn/Desktop/prodACA/docs/phase0-discovery/01-product-brief.md` - Contains the 3-Zone architecture principle, success metrics (OKRs), and tech stack decisions that constrain all implementation choices. The KR targets (p95 < 200ms, 99.95% uptime, < 8 hour integration) are the measurable gates for launch readiness.

- `/Users/avn/Desktop/prodACA/docs/phase0-discovery/03-competitive-analysis.md` - Contains the Keycloak selection rationale, protocol requirements (SAML 2.0 as a hard requirement), and the competitive feature matrix. Critical for developers making Keycloak configuration decisions and understanding why specific protocols and features were chosen.

- `/Users/avn/Desktop/prodACA/docs/phase0-discovery/04-stakeholder-analysis.md` - Contains the consolidated pain-point-to-solution mapping and stakeholder approval requirements. Essential for understanding the "why" behind prioritization decisions and for identifying the blocker stakeholders whose sign-off gates the launch.