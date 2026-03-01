# HealthGate — Competitive Analysis

## Healthcare Authentication Landscape (2026)

---

## 1. Major EHR Authentication Systems

### 1.1 Epic MyChart / EpicCare

| Dimension | Details |
|---|---|
| **Protocols** | SAML 2.0, OIDC, SMART on FHIR OAuth 2.0 |
| **MFA** | Required — TOTP, SMS OTP. WebAuthn emerging |
| **SSO** | Supported via Duo, Okta, Ping Identity |
| **Session Mgmt** | Configurable idle timeout: 20–120 minutes |
| **Shared Workstation** | Imprivata badge-tap / fingerprint "tap-and-go" |
| **Patient Auth API** | open.epic.com — SMART on FHIR for 3rd party apps |

**Strengths:**
- Most mature healthcare auth ecosystem
- Shared workstation solution (via Imprivata) is industry-leading
- SMART on FHIR API enables third-party integration

**Weaknesses:**
- Clinicians average **70+ logins per 12-hour shift** (Christus Health study: 12,903 clinicians, 184,606 logins in one week)
- **40+ clinical workflows** may trigger re-authentication
- New workstation initialization takes 5–10 minutes
- Each hospital system runs its own MyChart instance — no federated patient identity
- Patients report cookie/JS errors blocking login, confusing password reset flows

---

### 1.2 Oracle Health (Cerner)

| Dimension | Details |
|---|---|
| **Protocols** | SAML 2.0, OAuth 2.0, SMART on FHIR |
| **MFA** | Supported (SaaSPass integration) |
| **SSO** | SAML 2.0 via Okta, AD. Requires vendor support contact to enable |
| **Session Mgmt** | Centralized via Consumer Identity Provider API |
| **Patient Portal** | Health Data Intelligence with SAML consumer identity |

**Strengths:**
- Centralized consumer identity provider with single sign-out
- Strong FHIR API surface for integrations

**Weaknesses:**
- SAML enablement is not self-service — requires contacting Cerner Support
- Oracle transition has created documentation fragmentation
- Clinicians report login fatigue comparable to Epic

---

### 1.3 athenahealth

| Dimension | Details |
|---|---|
| **Protocols** | SAML 2.0 (Okta/Ping), OAuth 2.0 |
| **MFA** | Mandatory for all athenaOne users — TOTP, SMS |
| **SSO** | SAML 2.0 via certified partners; positioned as MFA equivalent |
| **Session Mgmt** | HIPAA-aligned auto-logoff |

**Strengths:**
- MFA is mandatory, no exceptions — strong compliance posture
- Targets small-to-mid practices where simplicity matters

**Weaknesses:**
- Limited enterprise SSO customization vs. Epic
- Shared workstation scenarios poorly addressed
- Less granular session policy controls

---

### 1.4 DrChrono (EverHealth)

| Dimension | Details |
|---|---|
| **Protocols** | OAuth 2.0 (API), basic web auth |
| **MFA** | Required — device-linked 2FA |
| **Session Mgmt** | 25-min idle timeout, 5-min warning popup |
| **Password Storage** | One-way hash (not reversible) |
| **Encryption** | SSL/TLS + AES-256 |

**Strengths:**
- Simple, functional auth for small practices
- Support PIN for HIPAA SRA compliance

**Weaknesses:**
- No enterprise SSO federation
- No SAML support
- Limited MFA configuration options

---

## 2. Cross-Platform Comparison Matrix

| Feature | Epic | Oracle/Cerner | athenahealth | DrChrono | **HealthGate (Target)** |
|---|---|---|---|---|---|
| SAML 2.0 | Yes | Yes | Yes | No | **Yes** |
| OIDC | Yes | Yes | Via partner | No | **Yes** |
| MFA Required | Yes | Optional | Yes | Yes | **Yes** |
| WebAuthn/Passkeys | Emerging | No | No | No | **Yes (Day 1)** |
| SSO Across Apps | Via Imprivata | Via SAML | Via SAML | No | **Native** |
| Session Timeout Config | 20-120 min | Configurable | Fixed | 25 min | **Per-app configurable** |
| Shared Workstation | Imprivata | Partial | No | No | **Planned (Phase 2)** |
| Unified Audit Trail | Per-system | Per-system | Per-system | Per-system | **Centralized** |
| Developer SDK | SMART on FHIR | SMART on FHIR | Limited | OAuth 2.0 | **React components** |
| Integration Time | Weeks | Weeks | Days | Days | **< 1 day** |
| Open Source | No | No | No | No | **Yes** |

---

## 3. Open-Source Identity Provider Comparison

### 3.1 Keycloak (Recommended)

| Dimension | Assessment |
|---|---|
| **Protocols** | OAuth 2.0, OIDC, SAML 2.0, LDAP, Kerberos, WebAuthn |
| **MFA** | TOTP, WebAuthn (FIDO2), OTP via email/SMS |
| **RBAC** | Full RBAC + ABAC via authorization services |
| **Audit Logging** | Comprehensive admin + user event logging, SIEM-exportable |
| **Multi-tenancy** | Realm isolation — strong separation between orgs |
| **Session Mgmt** | Configurable token lifetimes, idle/max session limits, per-client policies |
| **Community** | Largest open-source IdP community. Red Hat backed |
| **Healthcare Use** | Used in FHIR-based healthcare backends globally. Japanese pharma company: 2M+ users |
| **HIPAA BAA** | Self-hosted — org self-certifies compliance. No vendor BAA |
| **Maturity** | 10+ years. Most battle-tested open-source IdP |

**Verdict:** Best choice for regulated healthcare. Full SAML support (essential for EHR integration), deepest feature set, most production-proven.

---

### 3.2 Ory (Hydra + Kratos + Oathkeeper + Keto)

| Dimension | Assessment |
|---|---|
| **Protocols** | OAuth 2.0, OIDC (OpenID Certified), WebAuthn, TOTP. Limited SAML |
| **Architecture** | 4 microservices (Go), API-first, cloud-native |
| **Authorization** | Google Zanzibar model (Keto) — very expressive |
| **Certifications** | ISO 27001, SOC 2 Type 2 (managed cloud). No HIPAA BAA documented |
| **Performance** | Go-based — lightweight, fast, low memory vs. Keycloak's JVM |
| **Healthcare Use** | Healthcare-adjacent but not commonly cited in clinical deployments |

**Verdict:** Excellent for greenfield cloud-native builds with strong engineering teams. **Disqualifying gap:** limited SAML support makes it incompatible with most EHR federation requirements.

---

### 3.3 Authentik

| Dimension | Assessment |
|---|---|
| **Protocols** | OAuth 2.0, OIDC, SAML 2.0, LDAP, SCIM, RADIUS |
| **Architecture** | Python-based, requires PostgreSQL + Redis |
| **Key Feature** | Visual flow editor for custom auth journeys (no-code) |
| **SCIM** | Built-in — automated user lifecycle management |
| **Healthcare Use** | Growing adoption in SMB healthcare. Still relatively young |
| **HIPAA BAA** | None — community open-source project |

**Verdict:** Compelling Keycloak alternative for teams finding Keycloak operationally heavy. SAML support is a plus. **Risk:** younger project, less security hardening, no enterprise SLA.

---

### 3.4 Authelia

| Dimension | Assessment |
|---|---|
| **Protocols** | OAuth 2.0, OIDC (basic). **No SAML 2.0** |
| **Architecture** | Forward auth proxy (Go). < 20MB container, < 30MB RAM |
| **MFA** | TOTP, WebAuthn, push, email OTP |
| **Use Case** | Protecting internal dashboards behind reverse proxies |
| **Healthcare Use** | Homelabs and small orgs only. Not documented in enterprise healthcare |

**Verdict:** **Not appropriate** as a primary auth system for HIPAA-covered workloads. No SAML, no RBAC, no enterprise features.

---

### 3.5 IdP Decision Matrix

| Dimension | Keycloak | Ory | Authentik | Authelia |
|---|---|---|---|---|
| SAML 2.0 | **Yes** | Limited | **Yes** | No |
| OIDC | **Yes** | **Yes** (Certified) | **Yes** | Basic |
| MFA Methods | **TOTP, WebAuthn, OTP** | TOTP, WebAuthn | TOTP, WebAuthn, Duo | TOTP, WebAuthn |
| Fine-Grained AuthZ | **ABAC + RBAC** | **Zanzibar** | Limited | None |
| Audit Logging | **Comprehensive** | Structured | Event log | Basic |
| Production Maturity | **Very High** | Medium-High | Medium | Low-Medium |
| Healthcare Proven | **Yes** | Partial | Emerging | No |
| Learning Curve | High | High | Medium | Low |
| Operational Overhead | High | High (4 services) | Medium | Low |
| **Recommendation** | **Primary choice** | Alternative | Backup | Do not use |

---

## 4. Industry Pain Points — The Opportunity Gap

### What nobody has solved well:

1. **Clinician login friction** — 122 hours/year lost per clinician to auth overhead (Imprivata). 70+ logins per shift. No vendor has cracked this at scale.

2. **Federated patient identity** — Each health system runs separate identity silos. Patients maintain separate accounts per provider. No open standard for cross-org patient identity federation.

3. **Unified audit across apps** — Every platform logs auth events in its own format, its own system. Security teams manually correlate across systems during investigations.

4. **Developer-friendly integration** — EHR auth integration takes weeks. SMART on FHIR improves API access but doesn't solve the login UI problem. No "npm install auth" for healthcare.

5. **Passwordless in clinical settings** — 85% of healthcare IT leaders say it's critical, only 7% have implemented it. Shared workstation + clinical urgency makes traditional MFA impractical.

### Where HealthGate wins:

| Gap | HealthGate Approach |
|---|---|
| Clinician friction | SSO across all Health apps; future passwordless/badge-tap |
| Fragmented audit | Centralized Keycloak audit log for all apps |
| Developer integration | `<HealthGateLogin />` React component — < 1 day integration |
| Inconsistent compliance | One Keycloak realm with HIPAA-hardened defaults; app teams inherit compliance |
| Isolated auth architecture | 3-Zone model — auth compromise cannot reach PHI |

---

## 5. Key Takeaway

> No existing open-source or commercial solution provides a **plug-and-play, HIPAA-compliant, developer-friendly authentication platform** designed specifically for a portfolio of healthcare web applications. HealthGate fills this gap by combining Keycloak's battle-tested auth engine with a modern developer experience (React SDK) and architectural isolation (3-zone model) that treats auth security and PHI security as fundamentally separate concerns.
