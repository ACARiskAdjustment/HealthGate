# HealthGate HIPAA Compliance Package

## 1. Overview

HealthGate is architecturally isolated from Protected Health Information (PHI) via a 3-zone model. The authentication plane (Zone 1) handles identity, credentials, and sessions. PHI resides exclusively in Zone 3. This compliance package maps HealthGate's controls to HIPAA Security Rule requirements under 45 CFR Part 164, Subpart C.

**Scope:** HealthGate authentication platform (Zones 1 and 2 only).
**Out of scope:** Application-layer PHI handling (Zone 3), which is covered by each relying application's own compliance package.

---

## 2. HIPAA Security Rule Control Mapping

### 2.1 Administrative Safeguards (§164.308)

| HIPAA Control | Requirement | HealthGate Implementation | Evidence |
|---|---|---|---|
| §164.308(a)(1)(i) | Security Management Process | Threat model (STRIDE, 30+ threats), attack trees, quarterly pen testing, incident response procedures | `08-security-review.md` §2-3, `penetration-test-plan.md` |
| §164.308(a)(1)(ii)(A) | Risk Analysis | Full risk assessment with threat modeling, STRIDE analysis, 5 attack trees | `08-security-review.md` §2 |
| §164.308(a)(1)(ii)(B) | Risk Management | Mitigations for all identified threats, progressive lockout, rate limiting, WAF | `08-security-review.md` §2, `07-architecture-design.md` §4 |
| §164.308(a)(1)(ii)(C) | Sanction Policy | Account lockout (5 failures → progressive escalation: 15m → 30m → 60m → permanent), admin break-glass procedure | `src/lib/brute-force.ts`, `incident-response-runbooks.md` |
| §164.308(a)(1)(ii)(D) | Information System Activity Review | 23+ audit event types logged, SHA-256 hash chain tamper detection, 6yr-210day retention | `src/lib/audit.ts`, Elasticsearch ILM policy |
| §164.308(a)(3)(i) | Workforce Security | RBAC with realm and client roles, principle of least privilege, MFA for all admin access | Keycloak realm config, `07-architecture-design.md` §3 |
| §164.308(a)(3)(ii)(A) | Authorization | Role-based access with `clinician`, `admin`, `patient` realm roles; client-specific roles per application | Keycloak role mapping, `withAuth()` HOC, `RoleGate` component |
| §164.308(a)(4)(i) | Information Access Management | Zone isolation (auth plane cannot reach PHI zone), network policies enforce boundaries | `k8s/base/network-policies.yaml` |
| §164.308(a)(5)(i) | Security Awareness Training | Admin console guide, incident response tabletop exercises quarterly | `docs/operations/runbook.md`, training schedule |
| §164.308(a)(5)(ii)(D) | Password Management | 12+ char minimum, complexity rules, breach database check (HIBP k-anonymity), 12-password history, 365-day max age | `src/lib/validations.ts`, Keycloak password policy |
| §164.308(a)(6)(i) | Security Incident Procedures | 10 incident types with detection/response procedures, escalation matrix, 72hr breach notification | `incident-response-runbooks.md` |
| §164.308(a)(6)(ii) | Response and Reporting | SEV-1/2/3 escalation paths, PagerDuty integration, post-incident review within 24hr | `incident-response-runbooks.md` §escalation |
| §164.308(a)(7)(i) | Contingency Plan | Database failover (Patroni), backup restoration (PITR), disaster recovery procedures, RTO 15min / RPO 5min | `docs/operations/runbook.md` §6, `07-architecture-design.md` §8 |
| §164.308(a)(8) | Evaluation | Quarterly pen testing, annual comprehensive security assessment, continuous dependency scanning | `penetration-test-plan.md`, CI/CD security scans |

### 2.2 Physical Safeguards (§164.310)

| HIPAA Control | Requirement | HealthGate Implementation | Evidence |
|---|---|---|---|
| §164.310(a)(1) | Facility Access Controls | Kubernetes namespace isolation, network policies, pod security contexts (non-root, read-only FS) | `k8s/base/namespace.yaml`, `k8s/base/network-policies.yaml` |
| §164.310(d)(1) | Device and Media Controls | Container images signed, Trivy scanned (no critical/high CVEs), read-only filesystem, ephemeral containers | `Dockerfile`, `.github/workflows/ci.yml` |

### 2.3 Technical Safeguards (§164.312)

| HIPAA Control | Requirement | HealthGate Implementation | Evidence |
|---|---|---|---|
| §164.312(a)(1) | Access Control | OIDC Authorization Code + PKCE flow, encrypted session cookies, RBAC with Keycloak | `src/app/api/auth/login/route.ts`, `src/lib/crypto.ts` |
| §164.312(a)(2)(i) | Unique User Identification | Immutable UUID (`sub` claim) for every user, no shared accounts, email uniqueness enforced | Keycloak user storage, JWT `sub` claim |
| §164.312(a)(2)(ii) | Emergency Access | Break-glass admin procedure with separate credentials in Vault, all access logged | `docs/operations/runbook.md` §8 |
| §164.312(a)(2)(iii) | Automatic Logoff | 15-minute idle timeout (configurable 5-60), 12-hour max session, 2-minute warning dialog | `src/providers/healthgate-provider.tsx`, `src/components/auth/session-timeout-warning.tsx` |
| §164.312(a)(2)(iv) | Encryption and Decryption | AES-256-GCM cookie encryption, TLS 1.3 in transit, PostgreSQL TDE at rest | `src/lib/crypto.ts`, K8s TLS config |
| §164.312(b) | Audit Controls | Structured JSON audit logs with 23+ event types, SHA-256 hash chain, 6yr-210day retention via Elasticsearch ILM | `src/lib/audit.ts`, `k8s/base/monitoring/prometheus-rules.yaml` |
| §164.312(c)(1) | Integrity | SHA-256 hash chain on audit logs (tamper-evident), hourly automated verification, CRITICAL alert on chain break | `src/lib/audit.ts` `computeChainHash()`, Prometheus alert `AuditHashChainBroken` |
| §164.312(c)(2) | Mechanism to Authenticate ePHI | N/A — HealthGate does not store or process PHI. Auth plane isolated from PHI zone. | `07-architecture-design.md` §1 (3-zone model) |
| §164.312(d) | Person or Entity Authentication | Multi-factor authentication mandatory (TOTP + WebAuthn via Keycloak), password + MFA required for all users | Keycloak MFA enforcement, `src/app/login/mfa/page.tsx` |
| §164.312(e)(1) | Transmission Security | TLS 1.3 enforced (TLS 1.0/1.1/SSLv3 disabled), mTLS between internal services, HSTS preload | `src/middleware.ts` HSTS header, K8s network policies |
| §164.312(e)(2)(i) | Integrity Controls | Content-Security-Policy (no `unsafe-eval`), SRI for static assets, X-Content-Type-Options: nosniff | `src/middleware.ts` security headers |
| §164.312(e)(2)(ii) | Encryption | AES-256-GCM (cookies), RS256 2048-bit RSA (JWT signing), approved cipher suites only | `src/lib/crypto.ts`, Keycloak realm key config |

---

## 3. Sign-Off Requirements

Launch is blocked until all 4 approvals are obtained:

| # | Stakeholder | Role | Sign-Off Criteria | Status |
|---|---|---|---|---|
| 1 | **CISO (Dr. Robert Kim)** | Security Blocker | All 98 security checklist items GREEN; pen test critical/high findings remediated; HIPAA controls verified | ☐ Pending |
| 2 | **Privacy Counsel** | Legal Blocker | User-facing error messages reviewed (no PHI exposure); HIPAA compliance assessment passed; breach notification procedures approved | ☐ Pending |
| 3 | **VP Engineering** | Sponsor | Scope/timeline/resources confirmed; architecture review board approval obtained | ☐ Pending |
| 4 | **IT Security Admin (James Park)** | Admin Champion | Admin console meets operational needs; runbook reviewed; monitoring operational | ☐ Pending |

### Sign-Off Form

```
HEALTHGATE LAUNCH SIGN-OFF

Date: _______________
Version: _______________

I have reviewed the HealthGate security architecture, compliance controls,
and operational readiness documentation. I confirm that the items within
my area of responsibility meet the requirements for production deployment.

☐ CISO:            _______________ (Signature)    Date: ___________
☐ Privacy Counsel:  _______________ (Signature)    Date: ___________
☐ VP Engineering:   _______________ (Signature)    Date: ___________
☐ IT Security Admin: _______________ (Signature)   Date: ___________
```

---

## 4. Data Retention & Deletion

### 4.1 Retention Schedule

| Data Type | Retention Period | Storage | Deletion Method |
|---|---|---|---|
| Audit logs | 6 years + 210 days | Elasticsearch | ILM policy auto-delete |
| User credentials | Until account deletion + 30 days | Keycloak PostgreSQL | Hard delete with Keycloak API |
| Session data | Until session expiry | In-memory (Infinispan) | Automatic eviction |
| Encrypted cookies | Until expiry (max 12hr) | Browser | Cleared on logout + cookie maxAge |
| Backup archives | 90 days | S3 (encrypted, versioned) | Lifecycle policy auto-delete |
| Access tokens | 5 minutes | In-memory (BFF) | Automatic expiry |
| Refresh tokens | 12 hours max | Keycloak session store | Session termination |

### 4.2 User Account Deletion Procedure

Per HIPAA §164.530(j)(2), authentication records must be retained for 6 years from creation. When a user requests account deletion:

1. **Disable the account** immediately (prevents login)
2. **Retain audit logs** for 6yr-210day retention period
3. **Anonymize PII** in user record (email → hashed, name → "[Deleted User]")
4. **Delete credentials** (password hash, MFA secrets, recovery codes)
5. **Terminate all active sessions** (back-channel logout)
6. **Log the deletion event** (audit trail: `ACCOUNT_DELETED`)

---

## 5. Breach Notification Procedures

Per 45 CFR §164.404-408, breach notification must occur within specific timeframes.

### 5.1 Discovery & Assessment (0-24 hours)

1. **Detect** — Alert from monitoring, user report, or security scan
2. **Contain** — Isolate affected systems, revoke compromised credentials
3. **Assess** — Determine if ePHI was accessed/disclosed (HealthGate auth plane does not contain PHI, but credential compromise may enable PHI access in Zone 3)
4. **Document** — Timeline, affected users, data types, systems involved

### 5.2 Notification Timeline

| Notification | Recipient | Timeline | Method |
|---|---|---|---|
| **Internal** | CISO, Privacy Counsel, VP Engineering | < 1 hour after discovery | PagerDuty + Slack |
| **HHS OCR** | Department of Health & Human Services | ≤ 60 days if ≥ 500 individuals; annual log if < 500 | HHS Breach Portal |
| **Affected Individuals** | Users whose credentials were compromised | ≤ 60 days after discovery | Written notice (email + postal) |
| **Media** | Local media outlets | If ≥ 500 individuals in a state | Press release |

### 5.3 Notification Content (per §164.404(c))

Each notification must include:
- Description of the breach (what happened)
- Types of information involved
- Steps individuals should take (password reset, MFA re-enrollment)
- What HealthGate is doing in response
- Contact information for questions

---

## 6. Quarterly Compliance Activities

| Activity | Frequency | Owner | Evidence |
|---|---|---|---|
| Penetration testing (independent firm) | Quarterly | Security Team | Pen test report |
| Dependency vulnerability scan | Monthly | Platform Engineering | npm audit + Snyk report |
| Certificate renewal verification | Monthly | Platform Engineering | cert-manager status |
| Admin account access review | Quarterly | IT Security Admin | Access review report |
| Disaster recovery drill | Quarterly | Platform Engineering | DR test report |
| Incident response tabletop exercise | Quarterly | Security Team | Exercise report |
| Backup restoration test | Quarterly | DBA | Restoration test report |
| HIPAA control evidence refresh | Semi-annual | Compliance Team | Updated evidence package |
| Comprehensive security assessment | Annual | Third-party assessor | Assessment report |
| Penetration testing firm rotation | Every 2 years | Security Team | Vendor selection doc |

---

## 7. Third-Party Assessment Requirements

### 7.1 Pre-Launch Assessment

Before production deployment, an independent third-party must:
1. Review the 3-zone architecture against HIPAA requirements
2. Validate all controls in the mapping matrix (Section 2)
3. Verify penetration test results and remediation
4. Assess operational readiness (monitoring, incident response, DR)
5. Issue a formal compliance attestation letter

### 7.2 Assessment Criteria

| Category | Pass Criteria |
|---|---|
| Critical findings | 0 open at launch |
| High findings | 0 open at launch |
| Medium findings | Remediation plan with 30-day timeline |
| Low findings | Remediation plan with 90-day timeline |

### 7.3 Evidence Collection Guide

For each control in Section 2, collect:

| Evidence Type | Examples |
|---|---|
| **Configuration** | Keycloak realm export, K8s manifest screenshots, middleware header config |
| **Code** | Relevant source files (crypto.ts, audit.ts, brute-force.ts, middleware.ts) |
| **Test Results** | Unit test reports (103 passing), pen test reports, load test results |
| **Logs** | Sample audit log entries showing all required fields |
| **Procedures** | Runbook, incident response runbooks, key rotation procedures |
| **Monitoring** | Grafana dashboard screenshots, PagerDuty alert configurations |

---

## 8. 2025 HIPAA NPRM Compliance

The 2025 HIPAA Notice of Proposed Rulemaking introduces additional requirements with a 180-day compliance window:

| Requirement | Status | Notes |
|---|---|---|
| MFA for all users accessing ePHI systems | Implemented | TOTP + WebAuthn via Keycloak, mandatory enrollment |
| Encryption of ePHI at rest | Implemented | PostgreSQL TDE (AES-256), cookie encryption (AES-256-GCM) |
| Network segmentation | Implemented | 3-zone model with K8s network policies |
| Anti-malware on systems with ePHI access | N/A | HealthGate auth plane does not access PHI |
| 72-hour system restoration | Implemented | RTO 15 min, RPO 5 min, quarterly DR testing |
| Vulnerability scanning every 6 months | Exceeds | Monthly dependency scans, quarterly pen testing |
| Annual compliance audits | Planned | Third-party assessment annually |
