# HealthGate Penetration Test Plan

**Version:** 1.0
**Classification:** Confidential
**Schedule:** Pre-launch (4 weeks before production), then quarterly

## Test Environment

- Target: `staging-auth.googlehealth.com` (staging only; never test against production)
- Scope: All endpoints under `/api/auth/*`, Keycloak admin console, BFF UI pages
- Out of scope: PHI data plane (Zone 3), third-party SAML IdPs

## 28 Penetration Test Cases

### Authentication (PT-01 — PT-05)

| ID | Category | Test Case | OWASP Ref | Expected Result |
|---|---|---|---|---|
| PT-01 | Authentication | Credential stuffing with top 10,000 breach passwords | WSTG-ATHN-04 | Account lockout after 5 failures; IP rate limit after 20 failures |
| PT-02 | Authentication | Username enumeration via differential error messages | WSTG-ATHN-03 | Identical error messages regardless of email existence |
| PT-03 | Authentication | Username enumeration via timing side-channel | WSTG-ATHN-03 | Response time variance < 50ms between existing and non-existing accounts |
| PT-04 | Authentication | Password brute-force with progressive lockout bypass attempts | WSTG-ATHN-03 | Progressive lockout (15/30/60/permanent) cannot be bypassed |
| PT-05 | Authentication | TOTP brute-force (6-digit codes) | WSTG-ATHN-04 | Account locked after 5 MFA failures |

### Session Management (PT-06 — PT-09)

| ID | Category | Test Case | OWASP Ref | Expected Result |
|---|---|---|---|---|
| PT-06 | Session | Session fixation attack | WSTG-SESS-03 | Session ID regenerated on authentication |
| PT-07 | Session | Cookie attribute validation (HttpOnly, Secure, SameSite) | WSTG-SESS-02 | All cookies have HttpOnly, Secure, SameSite=Strict |
| PT-08 | Session | Session timeout enforcement (idle and max) | WSTG-SESS-07 | Sessions expire per configured timeouts; no client-side bypass |
| PT-09 | Session | Concurrent session handling | WSTG-SESS-05 | Patient realm limits enforced (max 3); FIFO eviction works |

### Authorization (PT-10 — PT-13)

| ID | Category | Test Case | OWASP Ref | Expected Result |
|---|---|---|---|---|
| PT-10 | Authorization | Horizontal privilege escalation (access another user's session) | WSTG-ATHZ-04 | Tokens are user-bound; no cross-user access possible |
| PT-11 | Authorization | Vertical privilege escalation (patient to admin) | WSTG-ATHZ-03 | JWT role claims cannot be manipulated; signature verification on all requests |
| PT-12 | Authorization | OIDC redirect_uri manipulation | WSTG-CLNT-04 | Only whitelisted redirect URIs accepted; no open redirect |
| PT-13 | Authorization | JWT algorithm confusion (alg:none, alg:HS256 with public key) | WSTG-CRYP-01 | Only RS256 accepted; all other algorithms rejected |

### Input Validation (PT-14 — PT-16)

| ID | Category | Test Case | OWASP Ref | Expected Result |
|---|---|---|---|---|
| PT-14 | Input | XSS injection in all input fields (email, name, password) | WSTG-INPV-01 | All input properly encoded; CSP blocks any injected scripts |
| PT-15 | Input | SQL injection via Keycloak API parameters | WSTG-INPV-05 | Parameterized queries prevent all SQL injection |
| PT-16 | Input | SAML assertion injection / XML Signature Wrapping | WSTG-INPV-12 | SAML signatures validated; assertion injection rejected |

### Cryptography (PT-17 — PT-18)

| ID | Category | Test Case | OWASP Ref | Expected Result |
|---|---|---|---|---|
| PT-17 | Cryptography | TLS configuration audit (cipher suites, protocol versions) | WSTG-CRYP-01 | TLS 1.3 only; no weak ciphers; A+ on Qualys SSL Labs |
| PT-18 | Cryptography | JWT signing key exposure (JWKS endpoint analysis) | WSTG-CRYP-02 | Only public keys exposed; private keys not accessible |

### Information Disclosure (PT-19 — PT-21)

| ID | Category | Test Case | OWASP Ref | Expected Result |
|---|---|---|---|---|
| PT-19 | Info Disclosure | Error message analysis (all failure modes) | WSTG-ERRH-01 | No stack traces, version numbers, internal hostnames |
| PT-20 | Info Disclosure | HTTP header analysis (security headers completeness) | WSTG-CONF-07 | All security headers present with correct values |
| PT-21 | Info Disclosure | Directory listing, backup files, hidden paths | WSTG-CONF-04 | No directory listing; no backup files accessible |

### CSRF (PT-22 — PT-23)

| ID | Category | Test Case | OWASP Ref | Expected Result |
|---|---|---|---|---|
| PT-22 | CSRF | CSRF attack on password change endpoint | WSTG-SESS-05 | CSRF token required and validated; SameSite=Strict prevents cookie attachment |
| PT-23 | CSRF | CSRF attack on logout endpoint | WSTG-SESS-06 | Logout requires valid session token; cross-origin logout prevented |

### Rate Limiting & API Security (PT-24 — PT-25)

| ID | Category | Test Case | OWASP Ref | Expected Result |
|---|---|---|---|---|
| PT-24 | Rate Limiting | Rate limit bypass (IP rotation, header spoofing X-Forwarded-For) | WSTG-BUSL-05 | Rate limits applied on true client IP; X-Forwarded-For not trusted from untrusted sources |
| PT-25 | API Security | Admin API access without admin role | WSTG-ATHZ-01 | HTTP 403 for non-admin tokens |

### Token & Network Security (PT-26 — PT-28)

| ID | Category | Test Case | OWASP Ref | Expected Result |
|---|---|---|---|---|
| PT-26 | Token | Token replay after logout | WSTG-SESS-04 | Access token rejected after session termination (within 5 min expiry — documented risk) |
| PT-27 | Token | Refresh token reuse after rotation | WSTG-SESS-03 | Reused refresh token triggers token family revocation |
| PT-28 | Network | Cross-zone communication without mTLS | WSTG-CONF-10 | Network policies block non-mTLS traffic between zones |

## Remediation SLAs

| Severity | CVSS | Remediation Deadline | Retest Deadline |
|---|---|---|---|
| Critical | 9.0–10.0 | 24 hours | 48 hours |
| High | 7.0–8.9 | 7 calendar days | 14 days |
| Medium | 4.0–6.9 | 30 calendar days | — |
| Low | 0.1–3.9 | 90 calendar days | — |
| Informational | — | Backlog | Annual review |

## Schedule

- **Pre-launch:** 4 weeks before production, independent third-party firm
- **Quarterly:** Every 90 days post-launch (rotating firms every 2 years)
- **Annual:** Comprehensive independent firm + internal Red Team
- **Ad-hoc:** After major feature releases or Keycloak version upgrades
