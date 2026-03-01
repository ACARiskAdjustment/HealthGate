# HealthGate -- Security Design Review

**Document Classification:** CONFIDENTIAL -- Google Health Internal
**Document ID:** HG-SDR-2026-001
**Version:** 1.0
**Date:** 2026-03-01
**Author:** Security Architecture Team, Google Health (HCISPP Certified)
**Review Status:** DRAFT -- Pending CISO Sign-off
**Distribution:** Dr. Robert Kim (CISO), James Park (IT Admin), VP Engineering, Privacy Counsel, Platform Engineering Lead
**Applicable Standards:** HIPAA Security Rule (45 CFR 164.302-164.318), 2025 HIPAA NPRM, NIST SP 800-63B (Digital Identity Guidelines), NIST SP 800-53 Rev. 5, OWASP ASVS 4.0.3, OWASP Testing Guide v4.2

---

## 1. Security Context

### 1.1 What This System Protects

HealthGate is a centralized authentication platform for all Google Health web applications. It is architecturally classified as **Zone 1 (Auth Plane)** within a 3-Zone isolation model. HealthGate protects and manages the following categories of security-critical data:

**Data Assets Under Protection:**

| Asset Class | Examples | Sensitivity Level |
|---|---|---|
| Authentication Credentials | Hashed passwords (Argon2id), TOTP secrets (AES-256 encrypted), WebAuthn public keys, recovery code hashes (bcrypt, cost 12) | CRITICAL |
| Session Material | Keycloak session identifiers, access tokens (JWT/RS256), refresh tokens, PKCE code verifiers, CSRF tokens | CRITICAL |
| Identity Metadata | User UUIDs, email addresses, full names, role assignments, MFA enrollment status | HIGH |
| Device Trust Artifacts | Trusted device cookies, device fingerprint hashes, user-agent/IP association history | HIGH |
| Audit Records | Structured JSON event logs for all authentication events, admin actions, policy changes | HIGH (integrity-critical) |
| Configuration State | Realm policies, client registrations, SAML/OIDC metadata, password policy parameters, lockout thresholds | HIGH |

**What HealthGate Explicitly Does NOT Protect or Store:**

- Protected Health Information (PHI) -- zero PHI resides in Zone 1 by architectural constraint
- Patient diagnoses, medications, lab results, treatment records
- Any of the 18 HIPAA identifiers beyond name and email (which are necessary for authentication)
- Social Security Numbers, insurance information, or financial data

This separation is the foundational security guarantee: if an attacker fully compromises Zone 1, they obtain authentication material but gain zero access to Protected Health Information stored in Zone 3.

### 1.2 Trust Boundaries (3-Zone Model)

```
 UNTRUSTED                    ZONE 1                        ZONE 2                      ZONE 3
 (Internet)               (Auth Plane)                   (Gateway)                (PHI Data Plane)
                                                                            
 +----------+    TLS 1.3   +------------------+   mTLS    +-------------+   mTLS   +----------------+
 |          | -----------> |  Next.js 14 BFF  | -------> |  API GW /   | -------> | Health App 1   |
 |  Browser |              |  (frontend +     |          |  Reverse    |          | (CDS)          |
 |  Client  |    TLS 1.3   |   API routes)    |          |  Proxy      |          +----------------+
 |          | -----------> |                  |          |             |   mTLS   +----------------+
 +----------+              +--------+---------+          |  - Token    | -------> | Health App 2   |
      |                             |                    |    Validation|         | (Lab Results)  |
      |                    TLS 1.3  | (OIDC/SAML)        |  - JWKS     |          +----------------+
      |                             v                    |    Cache     |   mTLS   +----------------+
      |                    +------------------+          |  - Rate      | -------> | Health App N   |
      |                    |  Keycloak 24+    |          |    Limiting  |          |                |
      |                    |  (Identity       |          |  - mTLS      |          +----------------+
      |                    |   Provider)      |          |    Termination|               |
      |                    +--------+---------+          +-------------+                |
      |                             |                                                   |
      |                    TLS 1.3  | (JDBC)                                           |
      |                             v                                            +-----v------+
      |                    +------------------+                                  | PostgreSQL  |
      |                    |  PostgreSQL 16   |                                  | (PHI Data)  |
      |                    |  (Auth DB)       |                                  | AES-256 TDE |
      |                    |  AES-256 TDE     |                                  +------------+
      |                    |  ZERO PHI        |
      |                    +------------------+
      |
 TRUST BOUNDARY 1:      TRUST BOUNDARY 2:            TRUST BOUNDARY 3:
 Internet / Zone 1      Zone 1 / Zone 2              Zone 2 / Zone 3
 - TLS 1.3 termination  - mTLS required              - mTLS required
 - WAF/DDoS protection  - JWT validation              - RBAC enforcement
 - Rate limiting         - Token-only auth             - Per-app authorization
 - Input validation      - No credential forwarding    - PHI access controls
 - CSP/Security headers  - Stateless proxy             - Audit per-access
```

**Trust Boundary Rules:**

1. **TB1 (Internet to Zone 1):** All traffic encrypted via TLS 1.3. Zone 1 is the only zone with internet-facing endpoints. All user-facing input validation occurs here. Security headers are applied at this boundary.
2. **TB2 (Zone 1 to Zone 2):** Communication is exclusively via mTLS. Zone 2 receives only signed JWTs from Zone 1 -- never raw credentials. Zone 2 validates tokens using cached JWKS and enforces rate limits.
3. **TB3 (Zone 2 to Zone 3):** Communication is exclusively via mTLS. Zone 3 services receive only validated requests with verified role claims. Zone 3 performs its own authorization decisions based on JWT claims.

**Critical Invariant:** No credential material (passwords, TOTP secrets, recovery codes, session tokens) ever crosses TB2 or TB3. Tokens crossing TB2 are signed, time-limited, and audience-restricted.

### 1.3 Regulatory Context

**HIPAA Security Rule (45 CFR Part 164, Subpart C):**
HealthGate is a component of a covered entity's information system that creates, receives, maintains, or transmits electronic protected health information (ePHI) -- specifically, it controls access to systems that contain ePHI. While HealthGate itself stores zero PHI, it is squarely within scope of the HIPAA Security Rule because it is the access control mechanism for systems that do contain ePHI.

**2025 HIPAA Security Rule NPRM (Notice of Proposed Rulemaking):**
The 2025 NPRM represents the first major update to the HIPAA Security Rule in 20 years. Key changes relevant to HealthGate:

1. **MFA becomes explicitly mandatory** -- the \"addressable\" ambiguity is eliminated. HealthGate's mandatory MFA enrollment (FR6) and enforcement (FR5) directly satisfy this requirement.
2. **Encryption becomes explicitly required** (no longer \"addressable\") -- TLS 1.3 in transit and AES-256 at rest are now non-negotiable.
3. **72-hour incident reporting** -- requires HealthGate to support rapid forensic analysis via audit logs.
4. **Technology asset inventory** -- requires documentation of all authentication components and their security configurations.
5. **180-day compliance window** from rule finalization -- HealthGate's launch timeline must align with this deadline.
6. **Patch management within 15 days for critical vulnerabilities** -- affects Keycloak, Node.js, and PostgreSQL patch cadence.
7. **Annual penetration testing** explicitly required -- HealthGate's quarterly schedule exceeds this minimum.
8. **Network segmentation** explicitly required -- HealthGate's 3-Zone model satisfies this by design.

---

## 2. STRIDE Threat Model

### 2.1 Spoofing

| Threat ID | Threat | Attack Vector | Likelihood | Impact | Mitigation | Residual Risk |
|---|---|---|---|---|---|---|
| S-1 | Credential Theft via Phishing | Attacker sends emails mimicking HealthGate login, harvests credentials on a lookalike domain | HIGH | CRITICAL | (1) Mandatory MFA (TOTP/WebAuthn) ensures stolen password alone is insufficient. (2) HSTS preload prevents SSL stripping on legitimate domain. (3) CSP `form-action 'self' {keycloak-url}` prevents form submission to unauthorized domains. (4) New device notification (FR22) alerts users to unauthorized access. (5) Security awareness training for all users (referenced in HIPAA 164.308(a)(5)). | LOW -- MFA renders credential-only phishing ineffective |
| S-2 | Session Hijacking via Cookie Theft | Attacker steals session cookie through XSS, network interception, or malware | MEDIUM | CRITICAL | (1) All cookies are `HttpOnly; Secure; SameSite=Strict` -- inaccessible to JavaScript, never sent cross-origin. (2) TLS 1.3 prevents network interception. (3) CSP with strict `script-src 'self'` prevents XSS payload execution. (4) Access tokens are 5-minute lived -- limiting window of exploitation. (5) Session binding to IP/User-Agent with anomaly detection. | LOW |
| S-3 | Token Replay Attack | Attacker captures a valid JWT and replays it to access protected resources | MEDIUM | HIGH | (1) Access tokens expire in 5 minutes (`exp` claim enforced). (2) Refresh tokens use rotation -- each refresh invalidates the previous token. (3) `jti` (JWT ID) claim enables token blacklisting. (4) `iat` and `auth_time` claims verified. (5) Gateway validates `iss`, `aud`, `exp`, and signature on every request. | LOW |
| S-4 | SAML Assertion Forgery | Attacker crafts or modifies a SAML assertion to impersonate a federated user | LOW | CRITICAL | (1) All SAML assertions must be signed (RSA-SHA256 minimum). (2) Signature validation is mandatory -- unsigned assertions are rejected. (3) SAML assertions optionally encrypted (AES-256). (4) Replay protection via `NotOnOrAfter` condition and `InResponseTo` correlation. (5) Audience restriction enforced (`<AudienceRestriction>`). | VERY LOW |
| S-5 | Credential Stuffing (using breach databases) | Attacker uses credentials from external breaches to attempt login | HIGH | HIGH | (1) Password breach list check via Have I Been Pwned API (k-anonymity model) at registration and password change (FR9). (2) Brute-force protection: 5-attempt lockout, progressive doubling (FR12). (3) IP-rate limiting: 20 failed attempts per IP per 5 minutes. (4) Mandatory MFA renders password-only access impossible. (5) New device notification (FR22) for unfamiliar logins. | LOW |

### 2.2 Tampering

| Threat ID | Threat | Attack Vector | Likelihood | Impact | Mitigation | Residual Risk |
|---|---|---|---|---|---|---|
| T-1 | JWT Claim Modification | Attacker modifies JWT claims (e.g., role escalation) in transit or at rest | LOW | CRITICAL | (1) JWTs signed with RS256 (RSA 2048-bit). Signature verification on every request at Gateway. (2) Signing keys stored in HashiCorp Vault, not in application config. (3) `kid` (Key ID) header verified against JWKS. (4) Any signature mismatch results in immediate rejection (HTTP 401). | VERY LOW |
| T-2 | CSRF (Cross-Site Request Forgery) | Attacker triggers authenticated actions (e.g., password change) via forged cross-origin requests | MEDIUM | HIGH | (1) Double-submit cookie pattern with CSRF token validation on all state-changing endpoints. (2) `SameSite=Strict` cookies prevent cookie attachment on cross-origin requests. (3) `Origin` and `Referer` header validation at the BFF layer. (4) CSP `form-action 'self' {keycloak-url}` restricts form submission targets. | VERY LOW |
| T-3 | Man-in-the-Middle (MITM) | Attacker intercepts communication between client and server | LOW | CRITICAL | (1) TLS 1.3 mandatory for all external communication. (2) HSTS with `max-age=31536000; includeSubDomains; preload` prevents downgrade. (3) HTTP requests (port 80) return 301 to HTTPS -- no content served over HTTP. (4) mTLS between all internal services (Zone 1 to Zone 2, Zone 2 to Zone 3). (5) Certificate pinning for mobile WebView clients (Phase 2). | VERY LOW |
| T-4 | Audit Log Tampering | Insider or attacker modifies or deletes audit logs to conceal activity | MEDIUM | CRITICAL | (1) Logs written to append-only storage (immutable index in Elasticsearch). (2) SHA-256 hash chain: each log entry's hash incorporates the previous entry's hash. (3) Logs replicated to a separate security zone accessible only to the CISO team. (4) Log deletion requires multi-party authorization (minimum 2 security team members). (5) Tamper detection alerting: hash chain verification runs hourly. (6) 6-year-210-day retention enforced via ILM policy. | LOW |
| T-5 | Database Tampering | Attacker modifies auth database (user roles, password hashes) directly | LOW | CRITICAL | (1) PostgreSQL connections via TLS 1.3 with client certificate authentication. (2) Database access restricted to Keycloak service account only (principle of least privilege). (3) No direct SQL access from any application tier. (4) All schema changes via versioned migrations (Flyway/Liquibase) with audit trail. (5) Database audit logging (pgAudit) for all DDL and privileged DML. | VERY LOW |

### 2.3 Repudiation

| Threat ID | Threat | Attack Vector | Likelihood | Impact | Mitigation | Residual Risk |
|---|---|---|---|---|---|---|
| R-1 | User Denies Authentication Action | User claims they did not log in, change password, or assign a role | MEDIUM | HIGH | (1) Comprehensive audit logging of all auth events (FR14) with: timestamp, user ID, IP address, user agent, session ID, correlation ID. (2) MFA provides non-repudiation -- possession of TOTP device proves the authenticated party had the second factor. (3) 6-year-210-day log retention per HIPAA. (4) Tamper-evident hash chain on audit logs. | LOW |
| R-2 | Admin Denies Administrative Action | Admin claims they did not disable an account, change a policy, or assign a role | MEDIUM | HIGH | (1) All admin actions logged with `admin_user_id`, target entity, old/new values, timestamp, IP address. (2) Admin sessions require MFA re-verification for sensitive operations (policy change, user deletion). (3) Admin audit trail is separate and immutable. (4) Admin console access logged at network level (WAF/proxy logs). | LOW |
| R-3 | Log Integrity Disputed During Audit | During an OCR investigation, the integrity of audit logs is questioned | LOW | CRITICAL | (1) SHA-256 hash chain provides cryptographic proof of log integrity. (2) Logs stored in append-only Elasticsearch indices with ILM-enforced immutability. (3) Hash chain root published to an external timestamping service (RFC 3161) daily. (4) Third-party attestation of log integrity is available via the compliance reporting feature (FR19). | VERY LOW |

### 2.4 Information Disclosure

| Threat ID | Threat | Attack Vector | Likelihood | Impact | Mitigation | Residual Risk |
|---|---|---|---|---|---|---|
| I-1 | Username Enumeration | Attacker determines valid email addresses via differential error messages or timing differences | HIGH | MEDIUM | (1) Identical error messages for all login failures: \"Invalid email or password\" (FR20). (2) Identical error messages for registration: \"Unable to create account\" regardless of email existence. (3) Identical response for password reset: \"If an account exists...\" (4) Constant-time comparison for credential validation to eliminate timing oracles. (5) Identical HTTP response codes and response body sizes for valid/invalid emails. | LOW |
| I-2 | Error Message Information Leakage | Stack traces, database errors, Keycloak version, or internal hostnames exposed in error responses | MEDIUM | MEDIUM | (1) Next.js BFF intercepts all Keycloak errors -- raw errors never forwarded to browser (FR20). (2) Generic error messages for all failure modes (see FR20 mapping table). (3) Production error pages never contain stack traces. (4) HTML source, JS bundles, and network responses stripped of: Keycloak version, PostgreSQL version, internal hostnames. (5) Custom error pages for all HTTP error codes (400, 401, 403, 404, 500). | VERY LOW |
| I-3 | Timing Side-Channel Attack | Attacker measures response time differences to determine whether an email exists or a password is partially correct | MEDIUM | MEDIUM | (1) Constant-time string comparison for credential validation (`crypto.timingSafeEqual` in Node.js). (2) Artificial delay normalization: all login responses take a minimum of 200ms regardless of outcome. (3) Keycloak performs full password hash comparison even for non-existent accounts (hash a dummy value). (4) Rate limiting prevents high-volume timing analysis. | LOW |
| I-4 | Token Exposure in Logs or URLs | JWTs or session tokens appear in server logs, browser history, or URL query parameters | MEDIUM | HIGH | (1) OIDC Authorization Code Flow with PKCE -- tokens never appear in URLs. Authorization codes are single-use, 60-second lived. (2) Server access logs configured to redact `Authorization` headers and cookie values. (3) Audit logs explicitly exclude: passwords, MFA secrets, TOTP codes, recovery codes, session tokens (FR14 AC5). (4) CSP `Referrer-Policy: strict-origin-when-cross-origin` prevents token leakage via referrer. (5) All POST-based token exchange -- no GET with token parameters. | VERY LOW |
| I-5 | Client-Side Token Exposure | Tokens accessible to JavaScript via localStorage, sessionStorage, or DOM | MEDIUM | HIGH | (1) Tokens stored exclusively in `HttpOnly` cookies -- inaccessible to JavaScript (NFR2). (2) `Secure` flag ensures cookies only transmitted over HTTPS. (3) `SameSite=Strict` prevents cross-origin cookie attachment. (4) Token values never stored in React state, Redux, or any client-side storage mechanism. (5) SDK enforces BFF pattern -- token exchange happens server-side only. | VERY LOW |

### 2.5 Denial of Service

| Threat ID | Threat | Attack Vector | Likelihood | Impact | Mitigation | Residual Risk |
|---|---|---|---|---|---|---|
| D-1 | Brute-Force Login Attack | Attacker attempts thousands of credential combinations against single or multiple accounts | HIGH | MEDIUM | (1) Per-account lockout: 5 consecutive failures triggers 15-minute lock, progressive doubling (FR12). (2) Per-IP rate limit: 20 failed attempts per 5 minutes (FR12). (3) UI-level throttle: 2-second delay after failure, 5 seconds after 3 failures. (4) HTTP 429 with `Retry-After` header for rate-limited requests. (5) CAPTCHA integration considered for Phase 2. | LOW |
| D-2 | Credential Stuffing at Scale | Attacker uses botnets to distribute credential stuffing across many IPs | HIGH | HIGH | (1) IP-level rate limiting at WAF/CDN layer before traffic reaches Keycloak. (2) Per-account lockout regardless of source IP. (3) Mandatory MFA renders credential-only attacks futile. (4) Anomaly detection: alert on login failure rate exceeding 10% sustained over 5 minutes. (5) Geographic-based rate limiting for non-expected regions. | MEDIUM -- distributed attacks from many IPs can still cause account lockouts |
| D-3 | Resource Exhaustion (Keycloak Overload) | Attacker floods Keycloak with valid or invalid auth requests to exhaust connection pools, memory, or CPU | MEDIUM | CRITICAL | (1) Kubernetes HPA auto-scales Keycloak replicas when CPU > 70% or p95 latency > 1 second. (2) PgBouncer connection pooling: max 200 connections per replica in transaction mode. (3) Request queue depth monitoring with alerting. (4) CDN absorbs static asset requests -- only auth API calls reach Keycloak. (5) Gateway (Zone 2) rate-limits inbound requests before forwarding to Keycloak. (6) Graceful degradation: cached JWKS allows existing sessions to continue during Keycloak overload. | LOW |
| D-4 | Password Reset Flood | Attacker requests password resets for many accounts, generating email flood and database load | MEDIUM | LOW | (1) Rate limit: 3 password reset requests per email per 15-minute window (FR10). (2) Excess requests silently dropped (no error -- prevents enumeration). (3) Same generic response regardless of email existence. (4) Rate limit per IP: 10 reset requests per 5-minute window regardless of target email. | VERY LOW |
| D-5 | Session Exhaustion | Attacker creates many valid sessions to exhaust server-side session storage | LOW | MEDIUM | (1) Max concurrent sessions per realm: unlimited for clinicians (operational need), 3 for patients. (2) FIFO session eviction when limit reached (EC4). (3) Session storage in Infinispan distributed cache with configurable max entries. (4) Session cleanup job runs every 5 minutes to purge expired sessions. | LOW |

### 2.6 Elevation of Privilege

| Threat ID | Threat | Attack Vector | Likelihood | Impact | Mitigation | Residual Risk |
|---|---|---|---|---|---|---|
| E-1 | RBAC Bypass via JWT Claim Manipulation | Attacker modifies `realm_access.roles` or `resource_access` claims in a JWT to gain unauthorized roles | LOW | CRITICAL | (1) JWT signed with RS256 -- any modification invalidates the signature. (2) Gateway validates signature on every request using JWKS. (3) `kid` header verified against published key set. (4) Role claims are authoritative from Keycloak only -- never accepted from client input. (5) Applications perform server-side role checks, never rely solely on client-side role checks. | VERY LOW |
| E-2 | Admin Account Escalation | Non-admin user gains admin access through OIDC parameter manipulation or Keycloak misconfiguration | LOW | CRITICAL | (1) `healthgate-admin` realm role assignment requires existing admin authorization. (2) Admin console access restricted by Keycloak client configuration (`admin-cli` client). (3) Admin role assignment is audit-logged (`ROLE_ASSIGN`). (4) No self-service role elevation -- all role changes require admin action. (5) Keycloak admin console on a separate URL with additional network restrictions (IP allowlist). | VERY LOW |
| E-3 | OIDC Redirect URI Manipulation | Attacker modifies `redirect_uri` to redirect authorization codes or tokens to an attacker-controlled endpoint | MEDIUM | HIGH | (1) Strict redirect URI whitelist in Keycloak client configuration -- exact match required, no wildcards. (2) PKCE (Proof Key for Code Exchange) binds the authorization code to the originating client. (3) `state` parameter validated to prevent CSRF in the OIDC flow. (4) Authorization codes are single-use and expire in 60 seconds. (5) Keycloak rejects any `redirect_uri` not in the registered whitelist. | VERY LOW |
| E-4 | Vertical Privilege Escalation via SAML Assertion Injection | Attacker injects or modifies SAML attributes to gain elevated roles during federated authentication | LOW | CRITICAL | (1) SAML assertions validated against the IdP's signing certificate. (2) Attribute mapping explicitly configured -- only mapped attributes are accepted. (3) SAML role attributes mapped through Keycloak's attribute-to-role mapper, not passed through verbatim. (4) Shadow account provisioning uses minimum-privilege role assignment. (5) Admin review required for federated users to receive elevated roles. | VERY LOW |
| E-5 | Break-Glass Procedure Abuse | Legitimate admin abuses the emergency access procedure to gain unauthorized access | LOW | HIGH | (1) Break-glass access requires master realm credentials stored separately from standard admin credentials. (2) All break-glass actions generate high-severity audit alerts. (3) Break-glass access triggers automatic CISO notification. (4) Post-incident review mandatory within 24 hours of any break-glass event. (5) Break-glass credentials rotated after every use. | LOW |

---

## 3. HIPAA Security Rule Compliance Matrix

| HIPAA Section | Requirement | HealthGate Implementation | Verification Method |
|---|---|---|---|
| **164.308(a)(1)(i)** | Security Management Process -- Implement policies and procedures to prevent, detect, contain, and correct security violations | (1) Keycloak realm-level security policies (FR18) for password, session, lockout, MFA enforcement. (2) Automated brute-force detection and lockout (FR12). (3) Real-time security alerting via Grafana/PagerDuty (NFR7). (4) Quarterly penetration testing with remediation SLAs. (5) Security incident response procedures (Section 10 of this document). | Policy audit, penetration test reports, incident response tabletop exercise |
| **164.308(a)(1)(ii)(A)** | Risk Analysis -- Conduct accurate and thorough assessment of risks and vulnerabilities | (1) This Security Design Review document, including STRIDE threat model (Section 2). (2) Attack trees for top 5 scenarios (Section 4). (3) Annual risk assessment refresh. (4) Threat model updated with each major feature release. | Annual risk assessment report, threat model review records |
| **164.308(a)(1)(ii)(B)** | Risk Management -- Implement security measures sufficient to reduce risks to reasonable levels | (1) 3-Zone architectural isolation. (2) Defense-in-depth: MFA, encryption, rate limiting, input validation, security headers. (3) Residual risk tracking in risk register. (4) Risk acceptance requires CISO sign-off. | Risk register review, control effectiveness testing |
| **164.308(a)(1)(ii)(C)** | Sanction Policy -- Apply appropriate sanctions against workforce members who violate policies | (1) Admin action audit trail enables investigation of policy violations. (2) Audit logs provide forensic evidence for sanction proceedings. (3) Documented in HR policy (external to HealthGate). | HR sanction policy document, audit log evidence capability demonstration |
| **164.308(a)(1)(ii)(D)** | Information System Activity Review -- Implement procedures to regularly review records of information system activity | (1) Pre-built compliance reports (FR19): Access Audit, Failed Authentication, MFA Enrollment, Session Policy Compliance. (2) Grafana dashboards for real-time activity monitoring (NFR7). (3) SIEM integration for automated anomaly detection. (4) Weekly security review of authentication metrics by James Park. | Compliance report generation, dashboard review records, SIEM alert logs |
| **164.308(a)(3)(i)** | Workforce Security -- Implement policies and procedures to ensure appropriate access | (1) Keycloak RBAC with realm and client roles (FR13). (2) Admin-controlled user lifecycle: create, enable, disable (FR17). (3) No self-service role elevation. (4) MFA enrollment status monitoring and enforcement. | User access audit report, role assignment review |
| **164.308(a)(3)(ii)(A)** | Authorization and Supervision -- Implement procedures for access authorization | (1) Role assignment requires admin authorization (FR13). (2) All role changes audit-logged (`ROLE_ASSIGN`, `ROLE_REVOKE`). (3) Composite roles for hierarchical permissions. (4) Per-application client roles for granular access control. | Role assignment audit trail, access review reports |
| **164.308(a)(3)(ii)(B)** | Workforce Clearance Procedure -- Implement procedures to determine appropriate access level | (1) Separate realms for clinicians and patients with different security policies. (2) Admin determines role assignment based on organizational role. (3) SCIM integration (FR23, Phase 2) for automated provisioning aligned with HR systems. | Realm configuration audit, role mapping documentation |
| **164.308(a)(3)(ii)(C)** | Termination Procedures -- Implement procedures for terminating access when employment ends | (1) Admin forced logout terminates all sessions within 30 seconds (FR8). (2) Account disable prevents future login. (3) SCIM deprovisioning (FR23) automates termination within 60 seconds of HR action. (4) Account disable does not delete audit trail. (5) Bulk termination supported for organizational events. | Termination procedure test (time from disable to session termination), SCIM integration test |
| **164.308(a)(4)(i)** | Information Access Management -- Implement policies for authorizing access to ePHI | (1) RBAC with principle of least privilege (FR13). (2) Per-application client roles enable fine-grained access. (3) Token audience restriction ensures tokens are scoped to specific applications. (4) Admin policy management without engineering changes (FR18). | Access control policy review, token audience configuration audit |
| **164.308(a)(4)(ii)(B)** | Access Authorization -- Implement policies for granting access | (1) Role-based access with explicit assignment. (2) No default access to any application -- users must be granted roles. (3) Composite role hierarchy documented and audited. | Role hierarchy documentation review, new user access verification |
| **164.308(a)(4)(ii)(C)** | Access Establishment and Modification -- Implement procedures for access changes | (1) All access changes (role assign/revoke) require admin action. (2) All changes audit-logged with admin ID, timestamp, old/new values. (3) Access modification events published to SIEM within 5 seconds. | Access change audit trail, SIEM event verification |
| **164.308(a)(5)(i)** | Security Awareness and Training -- Implement security awareness program | (1) Login monitoring: new device notifications (FR22) educate users about unauthorized access. (2) Session timeout warnings (FR7) reinforce security awareness. (3) Password expiry warnings educate users about credential hygiene. (4) MFA setup flow includes educational content about authenticator apps. | New device notification delivery verification, user-facing security messaging audit |
| **164.308(a)(5)(ii)(C)** | Login Monitoring -- Procedures for monitoring login attempts | (1) All login attempts (success and failure) logged (FR14). (2) Failed authentication report (FR19). (3) Grafana dashboard for login rate, failure rate, lockout rate (NFR7). (4) PagerDuty alert on login failure rate > 10% for 5 minutes. (5) New device/location notification to user (FR22). | Login monitoring dashboard review, alert configuration test |
| **164.308(a)(5)(ii)(D)** | Password Management -- Procedures for creating, changing, and safeguarding passwords | (1) 12+ character minimum with complexity requirements (FR9). (2) Breach list check via HIBP API (FR9). (3) Password history: last 12 passwords (FR9). (4) Password maximum age: 365 days with 14-day warning (FR9). (5) No personal data in passwords (FR9). (6) Secure password reset flow with single-use, time-limited tokens (FR10). (7) Passwords hashed with Argon2id (Keycloak 24+ default). | Password policy configuration audit, HIBP integration test, password reset flow audit |
| **164.308(a)(6)(i)** | Security Incident Procedures -- Implement policies for responding to security incidents | (1) Auth-specific incident response procedures (Section 10). (2) Detection via audit logs, SIEM alerts, and Grafana dashboards. (3) Escalation matrix from on-call engineer to CISO. (4) Post-incident review process with documented lessons learned. (5) 72-hour reporting capability per 2025 NPRM. | Incident response tabletop exercise, post-incident review records |
| **164.308(a)(6)(ii)** | Response and Reporting -- Identify and respond to suspected or known security incidents; mitigate harmful effects; document outcomes | (1) Automated detection: login anomaly alerts, lockout alerts, unauthorized role assignment alerts. (2) Admin forced logout for immediate containment (FR8). (3) Ad-hoc key rotation capability within 5 minutes for token security breaches. (4) Audit log export for forensic analysis (FR14). (5) Compliance report generation for regulatory reporting (FR19). | Incident response drill, forensic analysis capability test |
| **164.308(a)(7)(i)** | Contingency Plan -- Establish policies for responding to emergencies | (1) Keycloak HA: 3+ replicas across 2 availability zones (NFR4). (2) PostgreSQL HA: primary + synchronous standby with automatic Patroni failover (NFR4). (3) RTO: 15 minutes for Zone 1. RPO: 1 minute. (4) Cached JWKS enables existing sessions during Keycloak outage. (5) Monthly failover drills. (6) Full PostgreSQL backup every 6 hours with WAL archiving. | Failover drill results, backup restoration test, RTO/RPO measurement |
| **164.308(a)(7)(ii)(A)** | Data Backup Plan -- Establish procedures for retrievable exact copies of ePHI | (1) PostgreSQL full backup every 6 hours, encrypted at rest (AES-256). (2) WAL archiving for point-in-time recovery. (3) Backups tested monthly via restoration to isolated environment. (4) Backup integrity verified via checksum validation. | Monthly backup restoration test records, backup encryption verification |
| **164.308(a)(7)(ii)(B)** | Disaster Recovery Plan -- Establish procedures to restore any loss of data | (1) Point-in-time recovery via WAL replay. (2) Cross-AZ database replication. (3) Kubernetes cluster recreation via Terraform + Helm (IaC). (4) Documented runbook with step-by-step recovery procedures. (5) Annual DR drill with full environment recreation. | DR drill results, runbook review |
| **164.308(a)(7)(ii)(C)** | Emergency Mode Operation Plan -- Procedures for continued operation during emergency | (1) Break-glass procedure for emergency access (documented manual procedure in V1). (2) Cached JWKS enables existing session validation during Keycloak outage. (3) Graceful degradation: existing sessions persist, new logins queued. (4) Manual Keycloak failover procedure documented for worst-case scenarios. | Emergency mode operation test, break-glass procedure drill |
| **164.312(a)(1)** | Access Control -- Implement technical policies for electronic information systems that maintain ePHI | (1) Keycloak RBAC with realm and client roles (FR13). (2) Session management with idle and max timeout (FR7). (3) Forced logout / account disable (FR8). (4) Brute-force protection with progressive lockout (FR12). (5) OIDC-based access with short-lived tokens (5-minute access tokens). | Penetration test, RBAC configuration audit, session timeout verification |
| **164.312(a)(2)(i)** | Unique User Identification -- Assign unique name/number for tracking user identity | (1) System-generated UUID for every user (FR2 AC9). (2) UUIDs are immutable and used for all cross-system correlation. (3) No shared accounts permitted. (4) UUID is the `sub` claim in all JWTs. | User database audit (UUID uniqueness verification), shared account detection scan |
| **164.312(a)(2)(ii)** | Emergency Access Procedure -- Establish procedures for obtaining necessary ePHI during emergencies | (1) Break-glass procedure: admin elevates roles via master realm (documented manual procedure). (2) Break-glass access audit-logged and triggers CISO notification. (3) Automated break-glass with post-hoc audit planned for Phase 2. (4) Last-admin protection prevents accidental admin lockout (EC10). | Break-glass procedure tabletop exercise, audit trail verification |
| **164.312(a)(2)(iii)** | Automatic Logoff -- Implement electronic procedures that terminate sessions after inactivity | (1) Idle timeout: 15 minutes default, configurable 5-60 minutes per realm (FR7). (2) Max session lifetime: 12 hours clinician, 30 minutes patient (FR7). (3) Session warning dialog at 2 minutes before idle timeout (FR7). (4) Automatic logout on timer expiry with redirect to `/session-expired`. (5) Server-side session validation is authoritative -- client cannot extend sessions unilaterally. | Automated session timeout test, session audit log review |
| **164.312(a)(2)(iv)** | Encryption and Decryption -- Implement mechanism to encrypt and decrypt ePHI | (1) At-rest: PostgreSQL AES-256 TDE (dm-crypt/LUKS or cloud-native). (2) At-rest: Keycloak credential storage via Argon2id. (3) In-transit: TLS 1.3 with strong cipher suites (see Section 5). (4) Application-level: cookie encryption AES-256-GCM, JWT signing RS256. (5) Key management via HashiCorp Vault. | Encryption configuration audit, TLS scan (Qualys SSL Labs), key management review |
| **164.312(b)** | Audit Controls -- Implement hardware, software, and procedural mechanisms to record and examine activity | (1) 23+ event types logged in structured JSON (FR14). (2) Each entry includes: timestamp, event type, user ID, IP, user agent, session ID, client ID, realm, auth method, result, correlation ID. (3) 6-year-210-day retention via Elasticsearch ILM. (4) Tamper-evident SHA-256 hash chain. (5) Logs exclude passwords, MFA secrets, tokens, and PHI. (6) Real-time streaming to SIEM within 5 seconds. (7) Search and export via admin console. | Log integrity verification (hash chain validation), retention policy audit, SIEM integration test |
| **164.312(c)(1)** | Integrity -- Implement policies to protect ePHI from improper alteration or destruction | (1) JWT signatures (RS256) prevent token tampering. (2) Audit log hash chain prevents log tampering. (3) TLS provides integrity for data in transit. (4) Database integrity via PostgreSQL transactional guarantees. (5) Backup integrity via checksums. | Cryptographic verification of token signatures, hash chain validation, TLS integrity check |
| **164.312(c)(2)** | Mechanism to Authenticate Electronic PHI | N/A -- HealthGate stores zero PHI. The 3-Zone isolation model ensures PHI authentication mechanisms are the responsibility of Zone 3 applications. | Architecture review confirming zero PHI in auth database schema |
| **164.312(d)** | Person or Entity Authentication -- Implement procedures to verify identity | (1) Email + password authentication via Keycloak OIDC (FR1). (2) Mandatory MFA: TOTP (FR5/FR6) and WebAuthn/FIDO2 (FR24). (3) SAML 2.0 federation for external identity systems (FR4). (4) Recovery codes for MFA fallback (FR6). (5) Password breach list check (FR9). (6) No information leakage in authentication errors (FR20). (7) Trusted device management (FR21). | Authentication flow audit, MFA enforcement verification, SAML federation test |
| **164.312(e)(1)** | Transmission Security -- Implement technical security measures to guard against unauthorized access to ePHI being transmitted | (1) TLS 1.3 for all external communication. (2) HSTS with preload (FR15). (3) mTLS between all internal services. (4) HTTP-to-HTTPS redirect (301) on all endpoints. (5) Security headers on all responses (FR15). | TLS scan (Qualys SSL Labs A+ target), mTLS certificate verification, security header audit (securityheaders.com) |
| **164.312(e)(2)(i)** | Integrity Controls -- Implement security measures to ensure electronically transmitted ePHI is not improperly modified | (1) TLS provides authenticated encryption ensuring integrity in transit. (2) JWT signatures provide message-level integrity. (3) SAML assertion signatures provide integrity for federated authentication. | TLS configuration audit, JWT signature verification test |
| **164.312(e)(2)(ii)** | Encryption -- Implement mechanism to encrypt ePHI whenever deemed appropriate | (1) TLS 1.3 with cipher suites: `TLS_AES_256_GCM_SHA384`, `TLS_CHACHA20_POLY1305_SHA256`, `TLS_AES_128_GCM_SHA256`. (2) No CBC mode ciphers. (3) No SSLv3, TLS 1.0, or TLS 1.1. (4) Perfect Forward Secrecy (PFS) via ephemeral key exchange. | Cipher suite audit (nmap --script ssl-enum-ciphers), protocol version scan |

---

## 4. Attack Trees

### 4.1 Attack Tree 1: Account Takeover

```
[GOAL: Account Takeover]
|
+-- [1] Credential Theft
|   |
|   +-- [1.1] Phishing Attack
|   |   |-- Send lookalike login page email
|   |   |-- User enters credentials on phishing site
|   |   |-- BLOCKED: MFA required (TOTP/WebAuthn) -- password alone insufficient
|   |   |-- BLOCKED: HSTS preload prevents SSL downgrade on real domain
|   |   +-- BLOCKED: New device notification alerts user (FR22)
|   |
|   +-- [1.2] Credential Stuffing (breached passwords)
|   |   |-- Obtain credentials from external breach database
|   |   |-- Attempt login with stolen email/password
|   |   |-- BLOCKED: Password breach list check at registration (FR9/HIBP)
|   |   |-- BLOCKED: Account lockout after 5 failures (FR12)
|   |   |-- BLOCKED: IP rate limiting -- 20 failures per 5 min (FR12)
|   |   +-- BLOCKED: MFA required even if password is correct
|   |
|   +-- [1.3] Keylogger / Malware on Endpoint
|       |-- Capture keystrokes including password
|       |-- MITIGATED: MFA (TOTP is time-based -- captured code expires in 30-90s)
|       |-- MITIGATED: WebAuthn is phishing-resistant (origin-bound)
|       +-- RESIDUAL RISK: Real-time credential relay attack (requires Phase 2 mitigation)
|
+-- [2] Session Hijacking
|   |
|   +-- [2.1] XSS-based Cookie Theft
|   |   |-- Inject JavaScript payload via stored/reflected XSS
|   |   |-- BLOCKED: CSP script-src 'self' prevents inline script execution
|   |   |-- BLOCKED: HttpOnly cookies inaccessible to JavaScript
|   |   +-- BLOCKED: X-Content-Type-Options: nosniff prevents MIME confusion
|   |
|   +-- [2.2] Network-based Cookie Interception
|   |   |-- MITM on unsecured network
|   |   |-- BLOCKED: TLS 1.3 encrypts all traffic
|   |   |-- BLOCKED: Secure cookie flag prevents transmission over HTTP
|   |   +-- BLOCKED: HSTS preload prevents downgrade
|   |
|   +-- [2.3] Session Fixation
|       |-- Pre-set session ID before authentication
|       |-- BLOCKED: Keycloak regenerates session ID on authentication
|       +-- BLOCKED: OIDC auth code flow with PKCE prevents session fixation
|
+-- [3] Token Forgery
    |
    +-- [3.1] JWT Signing Key Compromise
    |   |-- Obtain RS256 private key from Vault or Keycloak
    |   |-- Forge arbitrary JWTs with any claims
    |   |-- MITIGATED: Keys in HashiCorp Vault with strict access policies
    |   |-- MITIGATED: 90-day key rotation limits exposure window
    |   |-- MITIGATED: Emergency key rotation in < 5 minutes
    |   +-- RESIDUAL RISK: Insider with Vault access (mitigated by access controls + audit)
    |
    +-- [3.2] Algorithm Confusion Attack
        |-- Trick JWT verifier into using HMAC with public key
        |-- BLOCKED: Keycloak and Gateway enforce RS256 only
        +-- BLOCKED: Algorithm whitelist in JWT validation configuration
```

### 4.2 Attack Tree 2: Brute-Force / Credential Stuffing

```
[GOAL: Bypass Authentication via Brute-Force]
|
+-- [1] Single-Account Brute-Force
|   |
|   +-- [1.1] Direct Password Guessing
|   |   |-- Submit password guesses for known email
|   |   |-- After 5 failures: account locked for 15 min (FR12)
|   |   |-- After 2nd lockout: 30 min, then 60 min, then permanent
|   |   |-- BLOCKED: Exponential lockout makes brute-force infeasible
|   |   +-- BLOCKED: Even if password guessed, MFA still required
|   |
|   +-- [1.2] Password Spraying (common passwords across many accounts)
|       |-- Use top 100 passwords against all known emails
|       |-- BLOCKED: 12-char minimum with complexity eliminates common passwords
|       |-- BLOCKED: HIBP breach list check rejects known compromised passwords
|       |-- BLOCKED: IP rate limit -- 20 failures per 5 min from single IP
|       +-- BLOCKED: Per-account lockout after 5 failures regardless of IP
|
+-- [2] Distributed Credential Stuffing
|   |
|   +-- [2.1] Botnet-Distributed Attack
|   |   |-- Use thousands of IPs to circumvent per-IP rate limiting
|   |   |-- Per-IP rate limit: 20 failures per 5 min per IP
|   |   |-- MITIGATED: Per-account lockout still triggers after 5 failures
|   |   |-- MITIGATED: WAF/CDN layer bot detection (behavioral analysis)
|   |   |-- MITIGATED: Anomaly alert when global failure rate > 10% for 5 min
|   |   +-- RESIDUAL RISK: Mass account lockout (DoS effect on legitimate users)
|   |
|   +-- [2.2] Slow-and-Low Attack (below rate limit thresholds)
|       |-- 1 attempt per account per hour across 10,000 accounts
|       |-- MITIGATED: MFA required -- password alone never grants access
|       |-- MITIGATED: Breach list check removes known-compromised passwords
|       +-- RESIDUAL RISK: Over days, some passwords may be found (MFA blocks access)
|
+-- [3] MFA Bypass
    |
    +-- [3.1] TOTP Brute-Force
    |   |-- Guess 6-digit TOTP codes (1,000,000 combinations)
    |   |-- Code valid for 90 seconds (3 time windows)
    |   |-- BLOCKED: 5 MFA failures locks account for 15 min (FR5 AC6)
    |   +-- BLOCKED: At 5 attempts/lockout, 1M codes requires 200,000 lockout periods
    |
    +-- [3.2] Recovery Code Guessing
    |   |-- Guess 11-char alphanumeric recovery codes (xxxxx-xxxxx)
    |   |-- Keyspace: 36^10 = ~3.6 quadrillion combinations
    |   |-- BLOCKED: Account lockout after 5 failures applies to recovery codes too
    |   +-- BLOCKED: Recovery codes hashed with bcrypt (cost 12) -- offline attack resistant
    |
    +-- [3.3] SIM-Swap (if SMS MFA existed)
        +-- N/A: HealthGate does NOT support SMS MFA (intentionally excluded for this reason)
```

### 4.3 Attack Tree 3: Session Hijacking via XSS

```
[GOAL: Steal Session via XSS]
|
+-- [1] Inject Malicious Script
|   |
|   +-- [1.1] Stored XSS via User Input
|   |   |-- Inject script in name field, email field, or admin console input
|   |   |-- BLOCKED: Output encoding (React's default JSX escaping)
|   |   |-- BLOCKED: Server-side input validation (Zod schemas)
|   |   |-- BLOCKED: CSP script-src 'self' blocks inline scripts
|   |   +-- BLOCKED: No user-generated content rendered as raw HTML (no dangerouslySetInnerHTML)
|   |
|   +-- [1.2] Reflected XSS via URL Parameters
|   |   |-- Inject script via redirect_uri, state, error_description parameters
|   |   |-- BLOCKED: redirect_uri strict whitelist (exact match, no wildcards)
|   |   |-- BLOCKED: All URL parameters sanitized before rendering
|   |   |-- BLOCKED: CSP script-src 'self' blocks injected scripts
|   |   +-- BLOCKED: React auto-escapes JSX content
|   |
|   +-- [1.3] DOM-based XSS via Client-Side Routing
|       |-- Manipulate client-side state to inject script into DOM
|       |-- BLOCKED: Next.js App Router sanitizes route parameters
|       |-- BLOCKED: CSP prevents inline script execution
|       +-- BLOCKED: No eval(), no Function constructor, no document.write()
|
+-- [2] Exfiltrate Session Data (if XSS succeeded)
|   |
|   +-- [2.1] Steal Session Cookie
|   |   |-- document.cookie to read session tokens
|   |   +-- BLOCKED: HttpOnly flag -- cookies invisible to JavaScript
|   |
|   +-- [2.2] Steal from localStorage/sessionStorage
|   |   |-- Access tokens from client-side storage
|   |   +-- BLOCKED: Tokens NEVER stored in localStorage or sessionStorage (NFR2)
|   |
|   +-- [2.3] Make Authenticated API Calls Directly
|   |   |-- Use existing cookies to make requests from XSS context
|   |   |-- MITIGATED: SameSite=Strict prevents cross-origin cookie use
|   |   |-- MITIGATED: CSRF token required on all state-changing requests
|   |   +-- MITIGATED: CSP connect-src limits outbound connections
|   |
|   +-- [2.4] Keylog Subsequent Credentials
|       |-- Capture next password entry via injected keylogger
|       |-- BLOCKED: CSP prevents loading external scripts
|       +-- MITIGATED: Short session lifetime (5 min access token) limits exposure
|
+-- [3] Persist XSS
    |
    +-- [3.1] Service Worker Registration
    |   |-- Register malicious service worker for persistence
    |   +-- BLOCKED: CSP and service worker scope restrictions
    |
    +-- [3.2] Cache Poisoning
        |-- Inject into cached responses
        +-- BLOCKED: Cache-Control: no-store on auth pages
```

### 4.4 Attack Tree 4: Privilege Escalation (RBAC Bypass)

```
[GOAL: Gain Unauthorized Admin/Elevated Access]
|
+-- [1] Token-Level Attacks
|   |
|   +-- [1.1] Modify JWT Role Claims
|   |   |-- Change realm_access.roles from [\"patient\"] to [\"healthgate-admin\"]
|   |   |-- BLOCKED: RS256 signature invalidated by any claim modification
|   |   +-- BLOCKED: Gateway rejects tokens with invalid signatures (HTTP 401)
|   |
|   +-- [1.2] Token Substitution
|   |   |-- Replace own token with another user's captured token
|   |   |-- BLOCKED: Tokens bound to specific session (session_state claim)
|   |   |-- BLOCKED: 5-minute access token lifetime limits window
|   |   +-- BLOCKED: Refresh token rotation invalidates previous tokens
|   |
|   +-- [1.3] Algorithm Confusion (none/HMAC)
|       |-- Set JWT alg to \"none\" or \"HS256\" with public key as secret
|       |-- BLOCKED: Algorithm whitelist enforced (RS256 only)
|       +-- BLOCKED: Keycloak and Gateway reject non-RS256 algorithms
|
+-- [2] OIDC/SAML Protocol Attacks
|   |
|   +-- [2.1] Redirect URI Manipulation
|   |   |-- Change redirect_uri to attacker-controlled domain
|   |   |-- BLOCKED: Strict redirect_uri whitelist (exact match)
|   |   +-- BLOCKED: PKCE binds auth code to originating client
|   |
|   +-- [2.2] SAML Attribute Injection
|   |   |-- Inject admin role in SAML assertion
|   |   |-- BLOCKED: Assertion signature validation
|   |   +-- BLOCKED: Attribute-to-role mapping configured by admin only
|   |
|   +-- [2.3] Client Impersonation
|       |-- Impersonate a different Keycloak client to access its roles
|       |-- BLOCKED: Client authentication via client_secret or mTLS
|       +-- BLOCKED: Audience (aud) claim validated at resource server
|
+-- [3] Administrative Attacks
|   |
|   +-- [3.1] Direct Admin Console Access
|   |   |-- Access Keycloak admin console without authorization
|   |   |-- BLOCKED: Admin console on separate URL with IP allowlist
|   |   |-- BLOCKED: Admin account requires MFA
|   |   +-- BLOCKED: Admin console access attempt logged and alerted
|   |
|   +-- [3.2] API-Based Role Elevation
|   |   |-- Call Admin REST API to self-assign admin role
|   |   |-- BLOCKED: Admin API requires bearer token with admin role
|   |   +-- BLOCKED: Non-admin tokens do not have admin API permissions
|   |
|   +-- [3.3] SCIM Injection (Phase 2)
|       |-- Manipulate SCIM payload to assign admin group membership
|       |-- MITIGATED: SCIM endpoint authenticated via dedicated service account
|       +-- MITIGATED: SCIM role mapping validated against allowlist
|
+-- [4] Insider Threat
    |
    +-- [4.1] Rogue Admin
    |   |-- Admin assigns elevated roles to unauthorized user
    |   |-- MITIGATED: All role changes audit-logged (ROLE_ASSIGN)
    |   |-- MITIGATED: SIEM alerts on sensitive role assignments
    |   +-- MITIGATED: Quarterly access review validates role assignments
    |
    +-- [4.2] Developer Backdoor
        |-- Developer inserts backdoor in Keycloak SPI or Next.js BFF
        |-- MITIGATED: Code review (mandatory 2-reviewer approval)
        |-- MITIGATED: CI/CD security scanning (Snyk, Trivy)
        |-- MITIGATED: Quarterly penetration testing
        +-- MITIGATED: Infrastructure as Code -- no manual production changes
```

### 4.5 Attack Tree 5: Audit Log Tampering

```
[GOAL: Modify or Delete Audit Logs to Conceal Unauthorized Activity]
|
+-- [1] Direct Log Modification
|   |
|   +-- [1.1] Elasticsearch Index Modification
|   |   |-- Gain access to Elasticsearch cluster and modify/delete documents
|   |   |-- BLOCKED: Elasticsearch in separate security zone with network isolation
|   |   |-- BLOCKED: Append-only index configuration (ILM-enforced immutability)
|   |   |-- BLOCKED: Elasticsearch access requires client certificate (mTLS)
|   |   +-- DETECTED: SHA-256 hash chain verification (hourly) detects modifications
|   |
|   +-- [1.2] Log Pipeline Interception (Logstash)
|   |   |-- Intercept or modify logs between Keycloak and Elasticsearch
|   |   |-- BLOCKED: Keycloak-to-Logstash communication via TLS
|   |   |-- BLOCKED: Log entries signed at source (Keycloak event listener)
|   |   +-- DETECTED: Missing sequence numbers detected during hash chain validation
|   |
|   +-- [1.3] Database-Level Log Deletion
|       |-- Access PostgreSQL and delete Keycloak event records
|       |-- BLOCKED: Database access restricted to Keycloak service account
|       |-- BLOCKED: pgAudit logs all DELETE operations on event tables
|       +-- DETECTED: Missing events detected during log integrity verification
|
+-- [2] Log Suppression
|   |
|   +-- [2.1] Disable Keycloak Event Listener
|   |   |-- Modify Keycloak config to disable event logging
|   |   |-- BLOCKED: Keycloak configuration managed via IaC (Terraform)
|   |   |-- BLOCKED: Configuration changes require code review + CI/CD pipeline
|   |   +-- DETECTED: \"Zero events for > 5 minutes\" alert fires via monitoring
|   |
|   +-- [2.2] Event Listener Code Modification
|   |   |-- Modify custom SPI to filter specific events
|   |   |-- BLOCKED: Container images built in CI/CD with hash verification
|   |   |-- BLOCKED: Read-only container filesystem
|   |   +-- DETECTED: Container image hash mismatch detected by Kubernetes admission controller
|   |
|   +-- [2.3] Selective Event Dropping
|       |-- Configure Keycloak to log only some event types
|       |-- BLOCKED: Event type configuration in IaC, not admin console
|       +-- DETECTED: Compliance report (FR19) flags missing event types
|
+-- [3] Log Integrity Destruction
|   |
|   +-- [3.1] Hash Chain Corruption
|   |   |-- Modify log entries AND recompute hash chain
|   |   |-- BLOCKED: Hash chain root published to external timestamping service (RFC 3161)
|   |   +-- BLOCKED: External timestamp cannot be retroactively modified
|   |
|   +-- [3.2] Backup Tampering
|       |-- Modify backup copies of logs to match tampered live logs
|       |-- BLOCKED: Backups encrypted at rest (AES-256) with integrity verification
|       |-- BLOCKED: Backup access requires separate credentials from live system
|       +-- BLOCKED: Log replicas maintained in separate security zone
|
+-- [4] Administrative Override
    |
    +-- [4.1] Admin Deletes Logs via Admin Console
    |   |-- Admin uses console features to purge log data
    |   |-- BLOCKED: Admin console does not expose log deletion functionality
    |   |-- BLOCKED: Log deletion requires multi-party authorization (2 security team members)
    |   +-- DETECTED: Log deletion attempts are themselves logged at infrastructure level
    |
    +-- [4.2] Admin Modifies Retention Policy
        |-- Admin changes ILM policy to delete logs sooner
        |-- BLOCKED: ILM policy managed via IaC, not admin console
        |-- BLOCKED: ILM policy change requires security team code review
        +-- DETECTED: ILM policy change alerts fire via infrastructure monitoring
```

---

## 5. Encryption Architecture

### 5.1 Encryption at Rest

| Component | Mechanism | Algorithm | Key Size | Key Storage | Notes |
|---|---|---|---|---|---|
| PostgreSQL (Auth DB) | Transparent Data Encryption via dm-crypt/LUKS (self-hosted) or cloud-native encryption (GCP CMEK / AWS KMS) | AES-256-XTS | 256-bit | HashiCorp Vault (self-hosted) or Cloud KMS | Covers all tablespaces including pg_wal. Encryption is transparent to Keycloak. |
| Password Hashes | Keycloak credential storage | Argon2id | N/A (memory-hard KDF) | Derived from password; hash stored in PostgreSQL | Parameters: memory=65536 KB (64 MB), iterations=3, parallelism=4, hash length=32 bytes. Keycloak 24+ uses Argon2id by default. |
| Recovery Code Hashes | Application-level hashing | bcrypt | N/A (cost-based KDF) | Hash stored in PostgreSQL | Cost factor: 12 (approximately 250ms per hash on modern hardware). |
| TOTP Secrets | Keycloak credential storage (encrypted) | AES-256-GCM | 256-bit | Keycloak realm key (stored in Vault) | TOTP secrets must be reversible (needed for validation), hence symmetric encryption rather than hashing. |
| Elasticsearch Indices (Audit Logs) | Index-level encryption | AES-256 | 256-bit | Elasticsearch keystore (backed by Vault) | All audit log indices encrypted. Snapshots also encrypted. |
| Backups (PostgreSQL) | Backup encryption | AES-256-GCM | 256-bit | Vault | All backup files encrypted before storage. Integrity verified via AEAD authentication tag. |
| etcd (Kubernetes Secrets) | Kubernetes secret encryption | AES-256-GCM | 256-bit | KMS provider or static key | Keycloak admin credentials, database passwords, TLS certificates stored as Kubernetes secrets. |

### 5.2 Encryption in Transit

| Communication Path | Protocol | Minimum Version | Cipher Suites (in preference order) | Certificate Type |
|---|---|---|---|---|
| Browser to Next.js BFF | TLS | 1.3 (mandatory) | `TLS_AES_256_GCM_SHA384`, `TLS_CHACHA20_POLY1305_SHA256`, `TLS_AES_128_GCM_SHA256` | Public CA (Let's Encrypt or DigiCert) |
| Browser to Keycloak (OIDC redirects) | TLS | 1.3 (mandatory) | Same as above | Public CA |
| Next.js BFF to Keycloak (back-channel) | mTLS | 1.3 | Same as above | Internal CA (Vault PKI) |
| Gateway to Keycloak (JWKS fetch) | mTLS | 1.3 | Same as above | Internal CA (Vault PKI) |
| Keycloak to PostgreSQL (JDBC) | TLS | 1.3 | `TLS_AES_256_GCM_SHA384` | Internal CA (Vault PKI) |
| Gateway to Zone 3 applications | mTLS | 1.3 | Same as external cipher suites | Internal CA (Vault PKI) |
| Keycloak to Logstash (audit events) | TLS | 1.3 | `TLS_AES_256_GCM_SHA384` | Internal CA (Vault PKI) |
| Keycloak to SMTP (email) | TLS | 1.2 (minimum, 1.3 preferred) | Provider-dependent | Provider CA |

**Explicitly Disabled:**
- SSLv3, TLS 1.0, TLS 1.1 -- disabled at all endpoints
- CBC mode cipher suites -- disabled (vulnerable to BEAST, Lucky13)
- RC4, DES, 3DES -- disabled
- Export-grade ciphers -- disabled
- NULL ciphers -- disabled
- Compression (CRIME attack) -- disabled

### 5.3 Application-Level Encryption

| Purpose | Algorithm | Key Size | Implementation | Notes |
|---|---|---|---|---|
| Cookie Encryption (access token cookie) | AES-256-GCM | 256-bit | Next.js BFF encrypts token before setting cookie | Nonce: 12-byte random per encryption. Authentication tag: 16 bytes. Prevents token extraction even if HttpOnly bypass found. |
| Cookie Encryption (refresh token cookie) | AES-256-GCM | 256-bit | Same as above | Separate key from access token cookie. |
| JWT Signing (access tokens) | RS256 (RSASSA-PKCS1-v1_5 + SHA-256) | RSA 2048-bit key pair | Keycloak signs; Gateway and applications verify | Public key published via JWKS endpoint. Private key in Vault. |
| SAML Assertion Signing | RSA-SHA256 | RSA 2048-bit (minimum) | Keycloak signs SAML responses | Certificate available in SAML metadata. |
| SAML Assertion Encryption (optional) | AES-256-CBC (XML Encryption) | 256-bit | Keycloak encrypts SAML assertions for sensitive attributes | Key transport via RSA-OAEP. |
| CSRF Token Generation | HMAC-SHA256 | 256-bit | Next.js BFF | Token = HMAC(session_id + timestamp, server_secret). |
| Device Trust Cookie | AES-256-GCM | 256-bit | Next.js BFF | Contains: HMAC(user_id + device_fingerprint + timestamp, server_secret). |

### 5.4 Key Management

| Key Type | Rotation Schedule | Grace Period | Storage | Access Control | Emergency Rotation |
|---|---|---|---|---|---|
| Keycloak JWT Signing Key (RS256) | Every 90 days | 30 days (old key valid for in-flight tokens) | HashiCorp Vault (transit engine) | Keycloak service account only; 2-person approval for manual access | < 5 minutes (automated via Vault API) |
| Cookie Encryption Keys (AES-256) | Every 30 days | 24 hours (old key valid for decryption only) | Kubernetes Secret (encrypted etcd), sourced from Vault | Next.js BFF pods only | < 10 minutes (pod restart with new secret) |
| mTLS Certificates (internal CA) | Every 365 days | 30 days | Vault PKI engine (auto-renewal via cert-manager) | Per-service identity | < 15 minutes (cert-manager re-issuance) |
| TLS Certificates (public CA) | Every 90 days (Let's Encrypt) or 365 days (DigiCert) | Automatic renewal at 30 days before expiry | cert-manager in Kubernetes | Platform team | < 30 minutes (manual issuance) |
| PostgreSQL TDE Key | Every 365 days | N/A (requires re-encryption) | Vault or Cloud KMS | DBA + Security team (2-person rule) | Planned downtime required |
| SAML Signing Certificate | Every 365 days | 60 days (published in metadata for partner transition) | Vault | Keycloak service account | < 30 minutes (requires IdP metadata update at partners) |
| Vault Unseal Keys | At initial setup; rotate per organizational policy | N/A | Shamir's Secret Sharing (3-of-5 threshold) | Security team leadership | Requires quorum |

---

## 6. Security Headers Specification

All headers are applied at the Next.js middleware layer (`middleware.ts`) and are enforced on every HTTP response. These values are non-configurable by downstream applications.

### 6.1 Content-Security-Policy

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data:;
  font-src 'self' https://fonts.gstatic.com https://api.fontshare.com;
  connect-src 'self' https://auth.googlehealth.com;
  frame-ancestors 'none';
  frame-src 'none';
  form-action 'self' https://auth.googlehealth.com;
  base-uri 'self';
  object-src 'none';
  media-src 'none';
  worker-src 'self';
  manifest-src 'self';
  upgrade-insecure-requests;
  block-all-mixed-content
```

**Directive Rationale:**
- `script-src 'self'` -- Only first-party scripts. No `unsafe-eval`, no `unsafe-inline` for scripts. If inline scripts are needed for Next.js hydration, use `nonce`-based CSP with per-request random nonces.
- `style-src 'self' 'unsafe-inline'` -- `unsafe-inline` required for Tailwind CSS and styled-jsx. Consider migrating to nonce-based styles in Phase 2.
- `img-src 'self' data:` -- `data:` required for QR code rendering (MFA setup page, FR6).
- `font-src` includes Google Fonts (Cormorant Garamond, Lora) and Fontshare (Satoshi) per UX spec.
- `connect-src 'self' https://auth.googlehealth.com` -- Allows XHR/fetch to HealthGate BFF and Keycloak.
- `frame-ancestors 'none'` -- Prevents HealthGate from being embedded in any iframe (anti-clickjacking).
- `form-action 'self' https://auth.googlehealth.com` -- Restricts form submission to HealthGate and Keycloak only.
- `object-src 'none'` -- Blocks Flash, Java applets, and other plugin content.
- `upgrade-insecure-requests` -- Forces subresource requests to HTTPS.
- `block-all-mixed-content` -- Prevents any mixed HTTP/HTTPS content.

### 6.2 Other Security Headers

| Header | Value | Notes |
|---|---|---|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` | 1-year HSTS. Includes all subdomains. Submit to HSTS preload list (hstspreload.org). |
| `X-Frame-Options` | `DENY` | Legacy clickjacking protection. Redundant with CSP `frame-ancestors 'none'` but included for older browser compatibility. |
| `X-Content-Type-Options` | `nosniff` | Prevents MIME type sniffing. Browser must respect declared Content-Type. |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Same-origin requests: full URL. Cross-origin requests: origin only. HTTPS-to-HTTP: no referrer. Prevents token/path leakage in referrer header. |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=(), ambient-light-sensor=(), autoplay=(), encrypted-media=(), fullscreen=(self), picture-in-picture=()` | Disables all unnecessary browser APIs. Only `fullscreen` permitted for the application itself. |
| `Cache-Control` | `no-store, no-cache, must-revalidate, private` | Applied to all authentication pages (login, register, MFA, password reset). Prevents caching of authentication state in browser or proxy caches. |
| `Pragma` | `no-cache` | Legacy cache prevention for HTTP/1.0 proxies. |
| `X-Request-Id` | `{uuid-v4}` | Unique per-request identifier for tracing. Generated by Next.js middleware. Forwarded to Keycloak and logged in audit events as `correlation_id`. |
| `X-DNS-Prefetch-Control` | `off` | Disables DNS prefetching to prevent information leakage about linked resources. |
| `Cross-Origin-Opener-Policy` | `same-origin` | Isolates browsing context to prevent cross-origin attacks (Spectre mitigation). |
| `Cross-Origin-Resource-Policy` | `same-origin` | Prevents resources from being loaded by cross-origin pages. |
| `Cross-Origin-Embedder-Policy` | `require-corp` | Ensures all loaded resources have appropriate CORS/CORP headers. |

### 6.3 Cookie Security Attributes

All cookies set by HealthGate use the following attributes:

```
Set-Cookie: hg_access={encrypted_token};
  Path=/;
  HttpOnly;
  Secure;
  SameSite=Strict;
  Max-Age=300;
  Domain=.googlehealth.com

Set-Cookie: hg_refresh={encrypted_token};
  Path=/api/auth/refresh;
  HttpOnly;
  Secure;
  SameSite=Strict;
  Max-Age={realm_max_session_seconds};
  Domain=.googlehealth.com

Set-Cookie: hg_csrf={csrf_token};
  Path=/;
  Secure;
  SameSite=Strict;
  Max-Age=86400;
  Domain=.googlehealth.com
  (Note: NOT HttpOnly -- must be readable by JavaScript for double-submit pattern)

Set-Cookie: hg_device_trust={encrypted_device_hash};
  Path=/;
  HttpOnly;
  Secure;
  SameSite=Strict;
  Max-Age=2592000;
  Domain=.googlehealth.com
  (Note: 30-day lifetime per FR21)
```

---

## 7. Input Validation and Output Encoding

### 7.1 Email Validation

| Rule | Implementation | Layer |
|---|---|---|
| Format validation | RFC 5322 compliant regex: `/^[a-zA-Z0-9.!#$%&'*+/=?^_\\`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/` | Client (Zod) + Server (Keycloak) |
| Maximum length | 254 characters (RFC 5321) | Client + Server |
| Normalization | Lowercase before comparison and storage | Client + Server |
| Domain validation | MX record check (server-side, async) | Server (Keycloak) |
| Homoglyph detection | Reject emails with mixed-script characters (IDN homograph attack prevention) | Server |
| Sanitization | Strip leading/trailing whitespace | Client + Server |

### 7.2 Password Validation

| Rule | Specification | Layer |
|---|---|---|
| Minimum length | 12 characters | Client (Zod) + Server (Keycloak policy) |
| Maximum length | 128 characters (prevent DoS via Argon2id on very long inputs) | Client + Server |
| Uppercase requirement | At least 1 uppercase letter [A-Z] | Client + Server |
| Lowercase requirement | At least 1 lowercase letter [a-z] | Client + Server |
| Digit requirement | At least 1 digit [0-9] | Client + Server |
| Special character requirement | At least 1 from: `!@#$%^&*()-_=+[]{};:'\",.<>?/\\|~` | Client + Server |
| Breach list check | First 5 chars of SHA-1 hash sent to HIBP API (k-anonymity) | Server (Keycloak password-blacklist policy) |
| Personal data exclusion | Must not contain email prefix, first name, or last name (case-insensitive substring) | Server (Keycloak) |
| Password history | Cannot reuse last 12 passwords | Server (Keycloak) |
| Common password list | Rejected against Keycloak built-in dictionary (10,000+ entries) | Server |
| No null bytes | Reject passwords containing `\\0` | Server |

### 7.3 TOTP Code Validation

| Rule | Specification | Layer |
|---|---|---|
| Format | Exactly 6 numeric digits [0-9] | Client (Zod) + Server |
| Input sanitization | Strip all non-digit characters | Client |
| Time window | Current time step +/- 1 step (90-second total tolerance) | Server (Keycloak OTP policy) |
| Anti-replay | Each code valid for single use within its time window (server tracks used codes) | Server |
| Rate limit | 5 failures triggers account lockout for 15 minutes | Server |
| Comparison method | Constant-time comparison to prevent timing attacks | Server |

### 7.4 Recovery Code Validation

| Rule | Specification | Layer |
|---|---|---|
| Format | 11 characters: `xxxxx-xxxxx` (alphanumeric lowercase + hyphen separator) | Client + Server |
| Normalization | Convert to lowercase, strip whitespace | Client + Server |
| Single-use | Code marked as consumed immediately upon successful use | Server |
| Hash comparison | bcrypt verify against stored hash (cost 12) | Server |
| Constant-time | `crypto.timingSafeEqual` on hash comparison result | Server |

### 7.5 OIDC Parameter Validation

| Parameter | Validation Rules | Layer |
|---|---|---|
| `redirect_uri` | Exact match against registered whitelist (no regex, no wildcards, no subdomain patterns). Must be HTTPS. No fragments (#). No open redirector patterns. | Server (Keycloak client config) |
| `response_type` | Must be exactly `code` (Authorization Code Flow only). No implicit flow. | Server |
| `state` | Minimum 32 bytes of cryptographic randomness. Validated on callback against stored value in HttpOnly cookie. | Client (SDK generates) + Server (BFF validates) |
| `nonce` | Minimum 32 bytes of cryptographic randomness. Included in ID token and validated by client. | Client (SDK generates) + Server (Keycloak includes in ID token) |
| `code_verifier` (PKCE) | 43-128 characters from unreserved character set [A-Z, a-z, 0-9, -, ., _, ~]. Stored in HttpOnly cookie (5-minute TTL). | Client (SDK generates) |
| `code_challenge` | SHA-256 hash of `code_verifier`, Base64URL-encoded. `code_challenge_method=S256` enforced (no plain). | Client sends to Keycloak |
| `scope` | Whitelist: `openid`, `profile`, `email`, `offline_access`. Unknown scopes rejected. | Server (Keycloak client config) |
| `client_id` | Must match a registered Keycloak client. No dynamic client registration allowed. | Server |
| `authorization_code` | Single-use. Expires in 60 seconds. Bound to `code_verifier` via PKCE. | Server |

### 7.6 XSS Prevention (Output Encoding Strategy)

| Context | Encoding Method | Implementation |
|---|---|---|
| HTML body content | React JSX auto-escaping (escapes `<`, `>`, `&`, `\"`, `'`) | Default React behavior -- no `dangerouslySetInnerHTML` permitted |
| HTML attributes | React JSX attribute escaping | Default React behavior |
| JavaScript context | Never inject user data into `<script>` blocks or event handlers | Architectural rule -- no dynamic JS generation |
| URL context | `encodeURIComponent()` for all user-supplied URL parameters | BFF + Client |
| CSS context | Never inject user data into styles | Architectural rule -- all styles via Tailwind classes |
| JSON context | `JSON.stringify()` with proper escaping for API responses | BFF |

**Prohibited Patterns (enforced by ESLint rules):**
- `dangerouslySetInnerHTML` -- banned globally
- `eval()`, `Function()`, `setTimeout(string)`, `setInterval(string)` -- banned globally
- `document.write()`, `document.writeln()` -- banned globally
- `innerHTML`, `outerHTML` -- banned globally
- Template literals in SQL queries -- banned (must use parameterized queries)

### 7.7 SQL Injection Prevention

| Layer | Method | Notes |
|---|---|---|
| Keycloak to PostgreSQL | Hibernate ORM with parameterized queries (JPA/Criteria API) | Keycloak does not use raw SQL. All database access through JPA entities. |
| Next.js BFF to PostgreSQL | No direct database access | BFF communicates only with Keycloak APIs (REST/OIDC). No database driver installed in BFF. |
| Admin custom queries | Keycloak Admin REST API with server-side parameter binding | Admin search queries (user search, audit log search) use Keycloak API with validated parameters. |
| Database migrations | Flyway/Liquibase with version-controlled SQL files | Migration scripts code-reviewed. No dynamic SQL in migrations. |

---

## 8. Rate Limiting Strategy

### 8.1 Rate Limit Table

| Endpoint / Action | Rate Limit (per IP) | Rate Limit (per Account) | Rate Limit (per Session) | Window | Response on Exceeded | Implementation Layer |
|---|---|---|---|---|---|---|
| **POST /login** (credential submission) | 20 failed attempts per 5 min | 5 consecutive failures triggers 15-min lockout (progressive: 15/30/60/permanent) | N/A | Sliding window | HTTP 429 + `Retry-After: 300` (IP); redirect to `/account-locked` (account) | Keycloak brute-force detection + Gateway rate limiter |
| **POST /login/mfa** (TOTP verification) | 30 per 5 min | N/A | 5 failures triggers session termination + 15-min account lockout | Sliding window | HTTP 429 (IP); redirect to `/account-locked` (session) | Keycloak brute-force detection |
| **POST /forgot-password** (reset request) | 10 per 5 min | 3 per email per 15 min | N/A | Sliding window | Silently dropped (HTTP 200 returned -- no enumeration signal) | Next.js BFF middleware |
| **POST /register** (account creation) | 5 per 5 min | N/A (no account yet) | N/A | Sliding window | HTTP 429 + `Retry-After: 300` | Next.js BFF middleware |
| **POST /api/auth/refresh** (token refresh) | 100 per min | N/A | 1 per 60 seconds (prevents race conditions) | Sliding window | HTTP 429 | Next.js BFF middleware |
| **GET /api/auth/session** (session status) | 200 per min | N/A | 10 per min | Sliding window | HTTP 429 | Next.js BFF middleware |
| **Keycloak Admin REST API** | 100 per min per admin IP | N/A | N/A | Sliding window | HTTP 429 | Gateway rate limiter |
| **OIDC Authorization endpoint** | 50 per min | 10 per min | N/A | Sliding window | HTTP 429 | Gateway rate limiter |
| **OIDC Token endpoint** | 100 per min | N/A | N/A | Sliding window | HTTP 429 | Gateway rate limiter |
| **JWKS endpoint** | 1000 per min (high -- caching expected) | N/A | N/A | Sliding window | HTTP 429 | Gateway rate limiter |
| **SAML SSO endpoint** | 30 per min | 10 per min | N/A | Sliding window | HTTP 429 | Gateway rate limiter |
| **SCIM endpoint** (Phase 2) | 100 per min per service account | N/A | N/A | Sliding window | HTTP 429 | Gateway rate limiter |

### 8.2 UI-Level Throttling

| Condition | Throttle Behavior |
|---|---|
| After 1st failed login | \"Continue\" button disabled for 2 seconds |
| After 3rd failed login (same browser session) | \"Continue\" button disabled for 5 seconds |
| After 5th failed login | Redirect to `/account-locked` -- no further attempts from UI |
| After failed TOTP | OTP input cleared, focus returned to first digit, 2-second input delay |

### 8.3 Implementation Architecture

```
[Browser] --> [CDN/WAF] --> [Next.js BFF (middleware)] --> [Gateway] --> [Keycloak]
              Layer 1        Layer 2                        Layer 3      Layer 4

Layer 1: CDN/WAF (Cloudflare / Cloud Armor)
  - DDoS protection (volumetric)
  - Bot detection (behavioral analysis)
  - Geographic rate limiting
  - IP reputation scoring

Layer 2: Next.js BFF Middleware
  - Application-level rate limiting (sliding window)
  - Per-endpoint limits using Redis-backed counters
  - CSRF validation
  - Request size limits (body: 1 MB max)

Layer 3: Gateway (Zone 2)
  - Per-client rate limiting
  - Token validation
  - Request deduplication

Layer 4: Keycloak
  - Brute-force detection (built-in)
  - Per-account lockout (FR12)
  - Failed login counter
  - Event logging
```

---

## 9. Penetration Test Plan

### 9.1 Scope

**In Scope:**
- All HealthGate authentication endpoints (Zone 1)
- Keycloak OIDC/SAML endpoints
- Next.js BFF API routes
- Admin console (Keycloak admin)
- React SDK integration points
- Gateway token validation (Zone 2)
- Network segmentation between zones

**Out of Scope:**
- Zone 3 (PHI Data Plane) applications -- tested separately
- Physical security
- Social engineering (separate engagement)
- DDoS testing (separate engagement with cloud provider coordination)

### 9.2 Methodology

Based on OWASP Testing Guide v4.2, OWASP ASVS 4.0.3, and NIST SP 800-115.

### 9.3 Test Cases

| Test ID | Category | Test Case | OWASP Reference | Expected Result |
|---|---|---|---|---|
| PT-01 | Authentication | Credential stuffing with top 10,000 breach passwords | WSTG-ATHN-04 | Account lockout after 5 failures; IP rate limit after 20 failures |
| PT-02 | Authentication | Username enumeration via differential error messages | WSTG-ATHN-03 | Identical error messages regardless of email existence |
| PT-03 | Authentication | Username enumeration via timing side-channel | WSTG-ATHN-03 | Response time variance < 50ms between existing and non-existing accounts |
| PT-04 | Authentication | Password brute-force with progressive lockout bypass attempts | WSTG-ATHN-03 | Progressive lockout (15/30/60/permanent) cannot be bypassed |
| PT-05 | Authentication | TOTP brute-force (6-digit codes) | WSTG-ATHN-04 | Account locked after 5 MFA failures |
| PT-06 | Session Management | Session fixation attack | WSTG-SESS-03 | Session ID regenerated on authentication |
| PT-07 | Session Management | Cookie attribute validation (HttpOnly, Secure, SameSite) | WSTG-SESS-02 | All cookies have HttpOnly, Secure, SameSite=Strict |
| PT-08 | Session Management | Session timeout enforcement (idle and max) | WSTG-SESS-07 | Sessions expire per configured timeouts; no client-side bypass |
| PT-09 | Session Management | Concurrent session handling | WSTG-SESS-05 | Patient realm limits enforced (max 3); FIFO eviction works |
| PT-10 | Authorization | Horizontal privilege escalation (access another user's session) | WSTG-ATHZ-04 | Tokens are user-bound; no cross-user access possible |
| PT-11 | Authorization | Vertical privilege escalation (patient to admin) | WSTG-ATHZ-03 | JWT role claims cannot be manipulated; signature verification on all requests |
| PT-12 | Authorization | OIDC redirect_uri manipulation | WSTG-CLNT-04 | Only whitelisted redirect URIs accepted; no open redirect |
| PT-13 | Authorization | JWT algorithm confusion (alg:none, alg:HS256 with public key) | WSTG-CRYP-01 | Only RS256 accepted; all other algorithms rejected |
| PT-14 | Input Validation | XSS injection in all input fields (email, name, password) | WSTG-INPV-01 | All input properly encoded; CSP blocks any injected scripts |
| PT-15 | Input Validation | SQL injection via Keycloak API parameters | WSTG-INPV-05 | Parameterized queries prevent all SQL injection |
| PT-16 | Input Validation | SAML assertion injection / XML Signature Wrapping | WSTG-INPV-12 | SAML signatures validated; assertion injection rejected |
| PT-17 | Cryptography | TLS configuration audit (cipher suites, protocol versions) | WSTG-CRYP-01 | TLS 1.3 only; no weak ciphers; A+ on Qualys SSL Labs |
| PT-18 | Cryptography | JWT signing key exposure (JWKS endpoint analysis) | WSTG-CRYP-02 | Only public keys exposed; private keys not accessible |
| PT-19 | Information Disclosure | Error message analysis (all failure modes) | WSTG-ERRH-01 | No stack traces, version numbers, internal hostnames, or database errors |
| PT-20 | Information Disclosure | HTTP header analysis (security headers completeness) | WSTG-CONF-07 | All security headers present with correct values (Section 6) |
| PT-21 | Information Disclosure | Directory listing, backup files, hidden paths | WSTG-CONF-04 | No directory listing; no backup files accessible; no hidden admin paths |
| PT-22 | CSRF | CSRF attack on password change endpoint | WSTG-SESS-05 | CSRF token required and validated; SameSite=Strict prevents cookie attachment |
| PT-23 | CSRF | CSRF attack on logout endpoint | WSTG-SESS-06 | Logout requires valid session token; cross-origin logout prevented |
| PT-24 | Rate Limiting | Rate limit bypass (IP rotation, header spoofing X-Forwarded-For) | WSTG-BUSL-05 | Rate limits applied on true client IP; X-Forwarded-For not trusted from untrusted sources |
| PT-25 | API Security | Admin API access without admin role | WSTG-ATHZ-01 | HTTP 403 for non-admin tokens; admin API unreachable without admin role |
| PT-26 | Token Security | Token replay after logout | WSTG-SESS-04 | Access token rejected after session termination (within 5 min expiry window -- acceptable risk documented) |
| PT-27 | Token Security | Refresh token reuse after rotation | WSTG-SESS-03 | Reused refresh token triggers token family revocation (all tokens for that session invalidated) |
| PT-28 | Network Security | Cross-zone communication without mTLS | WSTG-CONF-10 | Network policies block non-mTLS traffic between zones |

### 9.4 Tools

| Tool | Purpose | License |
|---|---|---|
| Burp Suite Professional | Manual/semi-automated web application testing | Commercial |
| OWASP ZAP | Automated scanning, passive analysis | Open Source |
| Nuclei | Template-based vulnerability scanning (Keycloak-specific templates) | Open Source |
| sqlmap | SQL injection verification | Open Source |
| testssl.sh | TLS configuration analysis | Open Source |
| jwt_tool | JWT attack testing (alg confusion, claim manipulation) | Open Source |
| SAMLRaider (Burp extension) | SAML assertion manipulation and testing | Open Source |
| Postman / Newman | API endpoint testing (Admin API, OIDC, SCIM) | Freemium |
| k6 | Load testing and performance under attack simulation | Open Source |
| Trivy | Container image vulnerability scanning | Open Source |
| Nmap | Network port scanning and service identification | Open Source |
| Custom Python scripts | Timing attack analysis, rate limit validation, credential stuffing simulation | Internal |

### 9.5 Schedule

| Activity | Timing | Performer | Deliverable |
|---|---|---|---|
| Internal security testing | Continuous (CI/CD pipeline) | Security Engineering team | Automated scan reports per build |
| Pre-launch penetration test | 4 weeks before production launch | Independent third-party firm | Full penetration test report with findings, severity ratings, and remediation recommendations |
| Quarterly penetration test | Every 90 days post-launch | Independent third-party firm (rotating firms every 2 years) | Updated penetration test report |
| Annual comprehensive assessment | Annually | Independent third-party firm + internal Red Team | Comprehensive security assessment including threat model validation |
| Ad-hoc testing | After major feature releases or Keycloak version upgrades | Security Engineering team | Targeted test report |

### 9.6 Remediation SLAs

| Severity | Remediation Deadline | Verification |
|---|---|---|
| Critical (CVSS 9.0-10.0) | 24 hours | Retest by penetration testing firm within 48 hours |
| High (CVSS 7.0-8.9) | 7 calendar days | Retest within 14 days |
| Medium (CVSS 4.0-6.9) | 30 calendar days | Retest in next quarterly assessment |
| Low (CVSS 0.1-3.9) | 90 calendar days | Retest in next quarterly assessment |
| Informational | Tracked in backlog | Reviewed annually |

---

## 10. Incident Response Procedures

### 10.1 Auth-Specific Incident Types

| Incident Type | Severity | Description | Example Indicators |
|---|---|---|---|
| INC-AUTH-01: Mass Credential Compromise | SEV-1 (Critical) | Evidence of widespread credential theft or unauthorized access to the auth database | Abnormal login success rate from new IPs; database access anomaly; public breach notification mentioning Google Health |
| INC-AUTH-02: Signing Key Compromise | SEV-1 (Critical) | JWT signing key exposed or suspected compromised | Tokens with unknown `kid`; tokens with future `iat`; unauthorized Vault access; public key listing in unintended location |
| INC-AUTH-03: Account Takeover (Individual) | SEV-2 (High) | Single user account accessed by unauthorized party | User-reported unauthorized activity; login from impossible geography (simultaneous logins from distant locations); new device notification flagged by user |
| INC-AUTH-04: Brute-Force / Credential Stuffing Campaign | SEV-2 (High) | Sustained, high-volume attack against login endpoint | Login failure rate > 10% for 5+ minutes; many account lockouts; IP rate limits triggered across multiple IPs |
| INC-AUTH-05: Privilege Escalation | SEV-1 (Critical) | User gains unauthorized elevated access | Unauthorized admin API calls; role assignment without admin action; unexpected role claims in tokens |
| INC-AUTH-06: Audit Log Integrity Failure | SEV-1 (Critical) | Evidence of audit log tampering or deletion | Hash chain validation failure; missing sequence numbers; unexpected ILM policy change |
| INC-AUTH-07: Keycloak Service Compromise | SEV-1 (Critical) | Keycloak instance compromised (RCE, configuration tampering) | Unexpected process execution; configuration drift detected; container image hash mismatch |
| INC-AUTH-08: Certificate/TLS Compromise | SEV-2 (High) | TLS certificate private key compromised or certificate authority breach | Certificate transparency log anomaly; unexpected certificate issuance; MITM attack evidence |
| INC-AUTH-09: Denial of Service (Auth) | SEV-2 (High) | Authentication service unavailable due to attack | Health check failures; all Keycloak replicas degraded; user-reported login failures |
| INC-AUTH-10: SAML Federation Compromise | SEV-2 (High) | Federated identity provider compromised, allowing unauthorized SAML assertions | Unusual SAML assertion patterns; federated IdP reports breach; shadow account creation anomaly |

### 10.2 Detection Mechanisms

| Mechanism | Implementation | Alerts |
|---|---|---|
| Real-time SIEM monitoring | Elasticsearch/Kibana with detection rules; audit event stream to SIEM | Anomalous login patterns, impossible travel, mass lockouts |
| Grafana alerting | Prometheus metrics with threshold-based alerts | Login failure rate > 10%, Keycloak replica down, 0 successful logins for 2 min |
| PagerDuty integration | Critical alerts page on-call; warning alerts to Slack | SEV-1 pages immediately; SEV-2 pages within 15 minutes |
| Hash chain verification | Hourly automated verification of audit log integrity | Any hash mismatch triggers SEV-1 alert |
| Container integrity monitoring | Kubernetes admission controller + Falco runtime security | Container image hash mismatch, unexpected process execution, file system modification |
| Vault audit logging | All secret access logged and monitored | Unauthorized key access, unusual key retrieval patterns |
| User self-reporting | New device notification (FR22) with \"Not you?\" link | User-reported unauthorized access triggers investigation |

### 10.3 Response Procedures

**INC-AUTH-01: Mass Credential Compromise**
1. IMMEDIATE (0-15 min): Page CISO and security team. Confirm scope of compromise via audit logs.
2. CONTAINMENT (15-60 min): Force password reset for all affected accounts. Invalidate all active sessions via Keycloak admin API. Rotate JWT signing keys (emergency rotation < 5 min). Disable any compromised service accounts.
3. ERADICATION (1-24 hours): Identify root cause (database breach, insider, supply chain). Patch vulnerability. Reset all credentials if database compromise confirmed.
4. RECOVERY (24-72 hours): Re-enable accounts with mandatory password reset + MFA re-enrollment. Monitor for continued unauthorized access. Communicate to affected users.
5. POST-INCIDENT: 72-hour regulatory notification per 2025 NPRM. Post-incident review within 5 business days. Update threat model and controls.

**INC-AUTH-02: Signing Key Compromise**
1. IMMEDIATE (0-5 min): Emergency key rotation via Vault API (automated, < 5 min). Publish new JWKS immediately.
2. CONTAINMENT (5-30 min): Invalidate all tokens signed with compromised key. Force re-authentication for all sessions. Remove compromised key from JWKS (no grace period in emergency).
3. ERADICATION (30 min-24 hours): Investigate root cause of key exposure. Revoke Vault access for any compromised service accounts.
4. RECOVERY (24-48 hours): Confirm all services using new signing key. Verify no forged tokens in circulation.
5. POST-INCIDENT: 72-hour regulatory notification. Post-incident review. Implement additional key access controls if needed.

### 10.4 Escalation Matrix

| Severity | Initial Responder | Escalation (15 min) | Escalation (1 hour) | Escalation (4 hours) |
|---|---|---|---|---|
| SEV-1 (Critical) | On-call Platform Engineer | Security Engineering Lead + CISO (Dr. Robert Kim) | VP Engineering + Privacy Counsel + Legal | C-Suite briefing |
| SEV-2 (High) | On-call Platform Engineer | Security Engineering Lead | CISO (Dr. Robert Kim) | VP Engineering |
| SEV-3 (Medium) | Platform Engineering team | Security Engineering Lead (next business day) | N/A | N/A |

### 10.5 Post-Incident Review Process

1. **Timeline reconstruction** using audit logs and monitoring data (within 24 hours of resolution)
2. **Root cause analysis** using the \"5 Whys\" method
3. **Impact assessment**: accounts affected, data exposed, duration of incident
4. **Control gap analysis**: which controls failed, which controls worked, what new controls are needed
5. **Remediation plan** with owners and deadlines
6. **Lessons learned** document shared with engineering and security teams
7. **Threat model update** incorporating the incident scenario
8. **Regulatory notification** if required (72 hours for HIPAA; state breach notification laws)
9. **Follow-up verification** that all remediation actions are complete (30-day review)

---

## 11. Dependency Security

### 11.1 Keycloak Security

| Activity | Frequency | Owner | Tool |
|---|---|---|---|
| CVE monitoring (Keycloak + Quarkus + Infinispan) | Daily (automated) | Security Engineering | GitHub Dependabot, NVD feed subscription, Red Hat Security Advisories |
| Version upgrade assessment | Within 48 hours of new release | Platform Engineering | Manual review of changelog + security advisories |
| Critical patch application | Within 15 days (per 2025 NPRM) | Platform Engineering | Staged rollout: dev -> staging -> canary -> production |
| Keycloak custom SPI audit | Per code change + quarterly review | Security Engineering | Code review + static analysis (SonarQube) |
| Keycloak configuration drift detection | Continuous | Platform Engineering | Terraform plan diff on every deployment; alert on unexpected changes |

### 11.2 Node.js / Next.js Dependency Security

| Activity | Frequency | Owner | Tool |
|---|---|---|---|
| `npm audit` | Every CI/CD build | CI/CD pipeline | `npm audit --production` (fail build on high/critical) |
| Snyk scanning | Every CI/CD build + daily scheduled scan | Security Engineering | Snyk CLI integrated into CI/CD |
| Dependency version pinning | All dependencies | Platform Engineering | `package-lock.json` committed; exact versions in `package.json` |
| Dependency update review | Weekly | Platform Engineering | Dependabot PRs reviewed and merged weekly |
| License compliance check | Per dependency update | Legal / Security Engineering | `license-checker` or Snyk license analysis |
| Transitive dependency audit | Monthly | Security Engineering | `npm ls --all` review; Snyk deep dependency analysis |

### 11.3 Container Image Security

| Activity | Frequency | Owner | Tool |
|---|---|---|---|
| Base image scanning | Every build | CI/CD pipeline | Trivy (fail build on critical/high CVEs) |
| Base image updates | Weekly (automated PR) | Platform Engineering | Renovate Bot or Dependabot for Dockerfile `FROM` lines |
| Runtime image scanning | Daily | Security Engineering | Trivy scheduled scan of running images |
| Image signing and verification | Every build and deploy | CI/CD pipeline + Kubernetes admission controller | Cosign (Sigstore) for image signing; Connaisseur or OPA Gatekeeper for verification |
| Minimal base images | Always | Platform Engineering | `distroless` or `alpine`-based images; no shell, no package manager in production |
| Non-root enforcement | Always | Platform Engineering | `USER nonroot` in Dockerfile; Kubernetes `runAsNonRoot: true` |

### 11.4 PostgreSQL Security

| Activity | Frequency | Owner | Tool |
|---|---|---|---|
| Security patch monitoring | Daily (automated) | DBA + Security Engineering | PostgreSQL security mailing list, NVD feed |
| Minor version updates (security patches) | Within 15 days of release | DBA | Staged rollout with automated testing |
| Major version upgrades | Annually (minimum) | DBA + Platform Engineering | Extensive staging testing before production |
| pgAudit configuration review | Quarterly | Security Engineering | Configuration audit script |
| Connection security audit | Monthly | Security Engineering | Verify TLS enforcement, client certificate requirements, pg_hba.conf review |

### 11.5 Patch Cadence Summary

| Component | Critical Patches | High Patches | Regular Updates |
|---|---|---|---|
| Keycloak | 24 hours (hotfix build) | 7 days | Within 30 days of release |
| Node.js / Next.js | 24 hours | 7 days | Within 14 days |
| PostgreSQL | 48 hours | 7 days | Within 30 days |
| Container base images | 24 hours (rebuild) | 7 days (rebuild) | Weekly rebuild |
| TLS certificates | Immediate (compromise) | N/A | Auto-renewal at 30 days before expiry |
| npm dependencies | 48 hours (critical) | 7 days | Weekly Dependabot merge |

---

## 12. Security Review Checklist (Launch Gate)

Every item below must be verified GREEN (passing) before production launch is approved. Any RED item is a launch blocker.

### 12.1 Authentication and Access Control

- [ ] MFA enrollment is mandatory for all users (no bypass, no skip)
- [ ] MFA enforcement verified for all login flows (direct login, SSO, SAML)
- [ ] Password policy enforced: 12+ chars, complexity, breach check, history (12), max age (365d)
- [ ] Brute-force protection active: 5-attempt lockout with progressive doubling
- [ ] IP-rate limiting active: 20 failures per 5 minutes per IP
- [ ] OIDC Authorization Code Flow with PKCE verified (no implicit flow)
- [ ] Refresh token rotation enabled and verified
- [ ] Access token lifetime set to 5 minutes
- [ ] RBAC configuration verified: correct realm and client roles
- [ ] No default or shared accounts exist in production
- [ ] Admin console access restricted by IP allowlist and MFA
- [ ] Break-glass procedure documented and tested

### 12.2 Session Management

- [ ] Idle timeout enforced: 15 minutes default (configurable 5-60)
- [ ] Max session lifetime enforced: 12 hours clinician, 30 minutes patient
- [ ] Session warning dialog appears 2 minutes before idle timeout
- [ ] Sessions terminated on logout (Keycloak session + all cookies cleared)
- [ ] Back-channel logout propagates to all relying parties within 30 seconds
- [ ] Browser back button does not display authenticated content after logout
- [ ] Session ID regenerated on authentication (no session fixation)
- [ ] Concurrent session limits enforced for patient realm (max 3)

### 12.3 Encryption

- [ ] TLS 1.3 enforced on all external endpoints (verified via Qualys SSL Labs: A+)
- [ ] TLS 1.0, 1.1, SSLv3 disabled
- [ ] Only approved cipher suites enabled (AES-256-GCM, CHACHA20-POLY1305, AES-128-GCM)
- [ ] No CBC mode ciphers
- [ ] mTLS verified between all internal services (Zone 1 to Zone 2, Zone 2 to Zone 3)
- [ ] PostgreSQL TDE enabled (AES-256)
- [ ] Cookie encryption verified (AES-256-GCM)
- [ ] JWT signing verified (RS256, 2048-bit RSA key)
- [ ] Key rotation schedule documented and tested (90-day JWT, 30-day cookie, 365-day mTLS)
- [ ] Emergency key rotation procedure tested (< 5 minutes for JWT signing key)
- [ ] All secrets in HashiCorp Vault (not in environment variables, config files, or source code)
- [ ] No plaintext credentials in any log output

### 12.4 Security Headers

- [ ] Content-Security-Policy present and correct (no `unsafe-eval`)
- [ ] Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
- [ ] X-Frame-Options: DENY
- [ ] X-Content-Type-Options: nosniff
- [ ] Referrer-Policy: strict-origin-when-cross-origin
- [ ] Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
- [ ] Cache-Control: no-store on all auth pages
- [ ] X-Request-Id present on all responses
- [ ] Cross-Origin-Opener-Policy: same-origin
- [ ] HTTP to HTTPS redirect (301) verified on all endpoints
- [ ] CSP evaluated by CSP Evaluator tool (no violations)
- [ ] Security headers verified via securityheaders.com (A+ rating target)

### 12.5 Input Validation

- [ ] All input fields validated client-side (Zod) and server-side (Keycloak)
- [ ] Email normalization (lowercase) implemented
- [ ] Password validation matches all FR9 requirements
- [ ] TOTP validation with constant-time comparison
- [ ] OIDC redirect_uri strict whitelist (exact match, no wildcards)
- [ ] PKCE `code_challenge_method=S256` enforced (no plain)
- [ ] `state` and `nonce` parameters validated with cryptographic randomness
- [ ] No `dangerouslySetInnerHTML` in any React component
- [ ] No `eval()`, `Function()`, `document.write()` in any JavaScript
- [ ] SAML assertion signature validation enforced
- [ ] SQL injection testing passed (parameterized queries verified)

### 12.6 Information Disclosure Prevention

- [ ] All error messages are generic (FR20 mapping table verified)
- [ ] No username enumeration possible via login, registration, or password reset
- [ ] No Keycloak version, PostgreSQL version, or internal hostnames in any response
- [ ] No stack traces in production error responses
- [ ] No sensitive data in URL query parameters
- [ ] No tokens, passwords, or MFA secrets in server logs
- [ ] Response timing is constant (< 50ms variance) for valid vs invalid emails
- [ ] Source code comments do not contain sensitive information

### 12.7 Audit Logging

- [ ] All 23+ event types are being logged (FR14 event table verified)
- [ ] Log entries contain all required fields (timestamp, event_type, user_id, IP, user_agent, session_id, client_id, realm, auth_method, result, correlation_id)
- [ ] Logs do NOT contain passwords, MFA secrets, TOTP codes, recovery codes, session tokens, or PHI
- [ ] SHA-256 hash chain verified and operational
- [ ] 6-year-210-day retention policy configured in Elasticsearch ILM
- [ ] Real-time SIEM integration operational (events within 5 seconds)
- [ ] Audit log search functional in admin console (by user, date, event type, IP, client)
- [ ] Tamper detection alerting active (hourly hash chain verification)

### 12.8 Infrastructure Security

- [ ] Container images scanned by Trivy (no critical/high CVEs)
- [ ] Container images signed and verified by admission controller
- [ ] Containers running as non-root with read-only filesystem
- [ ] Kubernetes network policies enforce zone isolation
- [ ] Pod-to-pod mTLS verified
- [ ] Kubernetes secrets encrypted in etcd
- [ ] No unnecessary ports exposed
- [ ] Health check endpoints operational (/healthz, /readyz)
- [ ] Monitoring and alerting operational (Grafana dashboards, PagerDuty alerts)
- [ ] All CI/CD security scans passing (npm audit, Snyk, Trivy, linting)

### 12.9 Compliance and Testing

- [ ] HIPAA Security Rule compliance matrix complete and verified (Section 3)
- [ ] Penetration test completed by independent third party
- [ ] All critical and high penetration test findings remediated
- [ ] Failover testing completed (Keycloak, PostgreSQL)
- [ ] Backup restoration test completed
- [ ] Incident response tabletop exercise completed
- [ ] Break-glass procedure tested
- [ ] Privacy Counsel has reviewed all user-facing error messages and emails
- [ ] CISO (Dr. Robert Kim) has signed off on security architecture
- [ ] Third-party HIPAA compliance assessment completed
- [ ] Security documentation complete (architecture doc, runbook, incident response plan)

### 12.10 Dependency Security

- [ ] All npm dependencies at latest stable versions with no known critical/high CVEs
- [ ] Keycloak at latest stable version with all security patches applied
- [ ] PostgreSQL at latest minor version with all security patches applied
- [ ] Base container images updated within last 7 days
- [ ] Automated dependency monitoring configured (Dependabot, Snyk, NVD feed)
- [ ] Dependency license compliance verified

---

**Document Approval:**

| Role | Name | Signature | Date |
|---|---|---|---|
| CISO | Dr. Robert Kim | ________________ | ________ |
| Security Architecture Lead | [Author] | ________________ | ________ |
| VP Engineering | [Name] | ________________ | ________ |
| Privacy Counsel | [Name] | ________________ | ________ |
| Platform Engineering Lead | [Name] | ________________ | ________ |

---

### Critical Files for Implementation

- `/Users/avn/Desktop/prodACA/docs/phase1-prd/06-prd.md` - Contains all 25 functional requirements (FR1-FR25) and 12 non-functional requirements (NFR1-NFR12) including the complete HIPAA control mapping (Appendix A), security specifications (NFR2), and edge cases (EC1-EC10) that this security design review directly references and provides security architecture for.

- `/Users/avn/Desktop/prodACA/docs/phase0-discovery/01-product-brief.md` - Defines the foundational 3-Zone isolation architecture, the tech stack constraints (Keycloak 24+, Next.js 14, PostgreSQL 16), and the success metrics (99.95% uptime, p95 < 200ms) that constrain every security design decision in this review.

- `/Users/avn/Desktop/prodACA/docs/phase0-discovery/05-ux-ui-design-spec.md` - Contains the complete UX specification including security-critical UX rules (Section 9), error message patterns that prevent information leakage (Section 6), session timeout dialog behavior, and cookie security requirements that must be implemented in the Next.js middleware layer.

- `/Users/avn/Desktop/prodACA/docs/phase0-discovery/03-competitive-analysis.md` - Documents the Keycloak selection rationale and the IdP decision matrix, including why SAML 2.0 support is a hard requirement for healthcare federation and why alternatives like Authelia were rejected for HIPAA workloads -- critical context for understanding the security architecture decisions.

- `/Users/avn/Desktop/prodACA/docs/phase0-discovery/04-stakeholder-analysis.md` - Contains the CISO (Dr. Robert Kim) and Admin (James Park) stakeholder requirements that drive the audit logging, compliance reporting, and incident response sections of this security review, including their specific sign-off criteria that gate production launch."}],"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":1,"cache_creation_input_tokens":6103,"cache_read_input_tokens":56768,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":6103},"output_tokens":1,"service_tier":"standard","inference_geo":"not_available"}},"requestId":"req_011CYciwtqSJoEp7CeA1X7b1","type":"assistant","uuid":"f8889250-26eb-405f-af8b-342c84ebfacc","timestamp":"2026-03-01T17:14:42.478Z"}
