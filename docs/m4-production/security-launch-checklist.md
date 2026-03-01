# HealthGate Security Launch Checklist

**Version:** 1.0
**Gate:** ALL items must be GREEN before production launch. Any RED is a launch blocker.

---

## 1. Authentication and Access Control (12 items)

- [ ] MFA enrollment is mandatory for all users (no bypass, no skip)
- [ ] MFA enforcement verified for all login flows (direct login, SSO, SAML)
- [ ] Password policy enforced: 12+ chars, complexity, breach check, history (12), max age (365d)
- [ ] Brute-force protection active: 5-attempt lockout with progressive doubling
- [ ] IP rate limiting active: 20 failures per 5 minutes per IP
- [ ] OIDC Authorization Code Flow with PKCE verified (no implicit flow)
- [ ] Refresh token rotation enabled and verified
- [ ] Access token lifetime set to 5 minutes
- [ ] RBAC configuration verified: correct realm and client roles
- [ ] No default or shared accounts exist in production
- [ ] Admin console access restricted by IP allowlist and MFA
- [ ] Break-glass procedure documented and tested

## 2. Session Management (8 items)

- [ ] Idle timeout enforced: 15 minutes default (configurable 5-60)
- [ ] Max session lifetime enforced: 12 hours clinician, 30 minutes patient
- [ ] Session warning dialog appears 2 minutes before idle timeout
- [ ] Sessions terminated on logout (Keycloak session + all cookies cleared)
- [ ] Back-channel logout propagates to all relying parties within 30 seconds
- [ ] Browser back button does not display authenticated content after logout
- [ ] Session ID regenerated on authentication (no session fixation)
- [ ] Concurrent session limits enforced for patient realm (max 3)

## 3. Encryption (12 items)

- [ ] TLS 1.3 enforced on all external endpoints (Qualys SSL Labs: A+)
- [ ] TLS 1.0, 1.1, SSLv3 disabled
- [ ] Only approved cipher suites: AES-256-GCM, CHACHA20-POLY1305, AES-128-GCM
- [ ] No CBC mode ciphers
- [ ] mTLS verified between all internal services (Zone 1 to Zone 2, Zone 2 to Zone 3)
- [ ] PostgreSQL TDE enabled (AES-256)
- [ ] Cookie encryption verified (AES-256-GCM)
- [ ] JWT signing verified (RS256, 2048-bit RSA key)
- [ ] Key rotation schedule documented and tested (90-day JWT, 30-day cookie, 365-day mTLS)
- [ ] Emergency key rotation procedure tested (< 5 minutes for JWT signing key)
- [ ] All secrets in HashiCorp Vault (not in env vars, config files, or source code)
- [ ] No plaintext credentials in any log output

## 4. Security Headers (12 items)

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

## 5. Input Validation (11 items)

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

## 6. Information Disclosure Prevention (8 items)

- [ ] All error messages are generic (FR20 mapping table verified)
- [ ] No username enumeration possible via login, registration, or password reset
- [ ] No Keycloak version, PostgreSQL version, or internal hostnames in any response
- [ ] No stack traces in production error responses
- [ ] No sensitive data in URL query parameters
- [ ] No tokens, passwords, or MFA secrets in server logs
- [ ] Response timing is constant (< 50ms variance) for valid vs invalid emails
- [ ] Source code comments do not contain sensitive information

## 7. Audit Logging (8 items)

- [ ] All 23+ event types are being logged (FR14 event table verified)
- [ ] Log entries contain all required fields (timestamp, event_type, user_id, IP, user_agent, session_id, client_id, realm, auth_method, result, correlation_id)
- [ ] Logs do NOT contain passwords, MFA secrets, TOTP codes, recovery codes, session tokens, or PHI
- [ ] SHA-256 hash chain verified and operational
- [ ] 6-year-210-day retention policy configured in Elasticsearch ILM
- [ ] Real-time SIEM integration operational (events within 5 seconds)
- [ ] Audit log search functional in admin console
- [ ] Tamper detection alerting active (hourly hash chain verification)

## 8. Infrastructure Security (10 items)

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

## 9. Compliance and Testing (11 items)

- [ ] HIPAA Security Rule compliance matrix complete and verified
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

## 10. Dependency Security (6 items)

- [ ] All npm dependencies at latest stable with no known critical/high CVEs
- [ ] Keycloak at latest stable version with all security patches
- [ ] PostgreSQL at latest minor version with all security patches
- [ ] Base container images updated within last 7 days
- [ ] Automated dependency monitoring configured (Dependabot, Snyk, NVD feed)
- [ ] Dependency license compliance verified

---

**Total: 98 items across 10 categories.**

## Sign-off

| Stakeholder | Role | Date | Status |
|---|---|---|---|
| VP Engineering | Sponsor | — | Pending |
| CISO (Dr. Robert Kim) | Security Blocker | — | Pending |
| Privacy Counsel | Legal Blocker | — | Pending |
| App Team Lead | Champion | — | Pending |
| IT Security Admin (James Park) | Admin Champion | — | Pending |
