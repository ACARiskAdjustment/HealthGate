# HealthGate -- Architecture Design Document

**Document ID:** ARCH-HG-2026-001
**Author:** Staff Engineer, Google Health Platform
**Status:** DRAFT -- Pending Architecture Review Board
**Date:** 2026-03-01
**Classification:** Google Confidential
**Reviewers:** Security Lead, SRE Lead, Privacy Counsel, HIPAA Compliance Officer
**Approvers:** Director of Engineering (Google Health), CISO (Health Division)

---

## 1. Context and Scope

### 1.1 Problem Statement

Google Health operates 6+ web-based healthcare applications. Each application independently implements its own authentication subsystem -- login, MFA, session management, password policies, and audit logging. This creates five compounding problems:

1. **Redundant engineering cost.** Each team spends approximately 6 weeks building authentication. Multiplied across 6 teams, this represents 36 engineer-weeks of duplicated effort that delivers zero clinical value.

2. **Inconsistent HIPAA compliance posture.** Each team interprets the HIPAA Security Rule (45 CFR 164.312) independently. Penetration tests repeatedly surface the same authentication vulnerabilities across different codebases. The 2025 HIPAA Security Rule update eliminates the \"addressable\" ambiguity around MFA and encryption, making consistent enforcement mandatory within a 180-day compliance window.

3. **No unified audit trail.** Security teams cannot answer \"who accessed what, when\" across the application portfolio without querying 6+ separate systems and manually correlating timestamps. This directly impedes HIPAA 164.312(b) audit control requirements and slows incident investigation to hours rather than minutes.

4. **Clinician login friction.** Clinicians average 70+ logins per 12-hour shift and lose 122 hours per year to authentication overhead (Imprivata research). Different credentials per application, inconsistent session behavior, and no SSO across the portfolio compound this burden.

5. **Regulatory risk.** Fragmented implementations expand the audit surface. An OCR investigator must review 6 separate systems rather than one, dramatically increasing the probability of findings.

HealthGate solves all five problems by providing a single, HIPAA-compliant, plug-and-play authentication platform that any Google Health web application can integrate in under one day.

### 1.2 In Scope (V1)

- Email + password authentication via OIDC Authorization Code Flow with PKCE (FR1)
- User registration with mandatory MFA enrollment (FR2, FR6)
- Logout with SSO propagation (FR3)
- SSO and SAML 2.0 federation (FR4)
- TOTP MFA challenge and enrollment (FR5, FR6)
- Session management with idle timeout (15 min), max lifetime (8-12 hr), and session warning dialog (FR7)
- Admin-initiated forced logout (FR8)
- HIPAA-compliant password policy with Argon2/bcrypt hashing (FR9)
- Password reset and change (FR10, FR11)
- Brute-force protection with progressive lockout (FR12)
- RBAC via Keycloak realm roles and client roles (FR13)
- Structured JSON audit logging with 6-year retention and tamper evidence (FR14)
- Security headers: CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy (FR15)
- React SDK: `<HealthGateProvider>`, `<HealthGateLogin />`, `<ProtectedRoute>`, `<SessionTimeoutWarning>`, `useAuth()`, `useRoles()`, `useSession()` (FR16)
- Admin console: user management, policy management, compliance reports (FR17-FR19)
- Generic error messages with zero information leakage (FR20)
- Trusted device / remember device (FR21)
- New device/location email notification (FR22)
- WebAuthn/FIDO2 readiness (FR24) -- infrastructure only, full passwordless deferred
- i18n readiness (FR25) -- English only, externalized strings

### 1.3 Out of Scope (V1)

- Passwordless authentication (badge tap, biometric-only login)
- Shared workstation \"tap-and-go\" (Imprivata-like)
- Patient identity federation across health systems
- SMS-based MFA
- SCIM provisioning (FR23 -- Phase 2)
- Multi-region deployment
- Custom branding per application
- Adaptive / risk-based authentication
- Social login
- Mobile native SDK (iOS, Android)
- Fine-grained ABAC / Zanzibar-style authorization
- Automated break-glass emergency access

---

## 2. System Architecture

### 2.1 Three-Zone Isolation Model

The architectural cornerstone of HealthGate is the **3-Zone isolation model**. The authentication plane (Zone 1) is network-isolated from the PHI data plane (Zone 3). An attacker who compromises the login layer gains zero access to protected health information. The auth database contains zero PHI -- ever.

```
 ┌─────────────────────────────────────────────────────────────────────────────────┐
 │                              INTERNET / CLIENT                                  │
 │                                                                                 │
 │    Browser (React SDK)           Mobile (WebView)         External IdP          │
 │    ┌──────────────────┐         ┌──────────────┐         (Hospital AD/Okta)     │
 │    │ @healthgate/react│         │  OIDC in      │         ┌──────────────┐      │
 │    │ - HealthGateLogin│         │  WKWebView    │         │ SAML 2.0 IdP │      │
 │    │ - SessionProvider│         └──────┬────────┘         └──────┬───────┘      │
 │    │ - useAuth()      │               │                         │               │
 │    └────────┬─────────┘               │                         │               │
 │             │                         │                         │               │
 └─────────────┼─────────────────────────┼─────────────────────────┼───────────────┘
               │ HTTPS :443              │ HTTPS :443              │ HTTPS :443
               │ TLS 1.3                 │ TLS 1.3                 │ TLS 1.3
 ══════════════╪═════════════════════════╪═════════════════════════╪════════════════
               │                         │                         │
 ┌─────────────▼─────────────────────────▼─────────────────────────▼───────────────┐
 │                                                                                 │
 │  ZONE 1: AUTH PLANE          K8s namespace: healthgate-auth                     │
 │  ────────────────────────────────────────────────────────────────────────────    │
 │  Docker network: hg-auth-net (172.20.0.0/16)                                   │
 │                                                                                 │
 │  ┌───────────────────────┐    ┌──────────────────────────────────────────────┐  │
 │  │   Ingress Controller  │    │           Keycloak 24+ Cluster              │  │
 │  │   (NGINX / Envoy)     │    │  ┌──────────┐ ┌──────────┐ ┌──────────┐    │  │
 │  │                       │    │  │ KC Pod 1  │ │ KC Pod 2  │ │ KC Pod 3  │   │  │
 │  │   TLS termination     ├───►│  │ :8080     │ │ :8080     │ │ :8080     │   │  │
 │  │   Rate limiting       │    │  │ Infinispan│◄►│Infinispan│◄►│Infinispan│   │  │
 │  │   WAF rules           │    │  │ (ISPN)    │ │ (ISPN)    │ │ (ISPN)    │   │  │
 │  │                       │    │  └─────┬─────┘ └─────┬─────┘ └─────┬─────┘   │  │
 │  │   Port 443 (ext)      │    │        │             │             │          │  │
 │  │   Port 8443 (int)     │    │        └──────┬──────┘──────┬──────┘          │  │
 │  └───────────┬───────────┘    │               │             │                 │  │
 │              │                │               │ JDBC :5432   │                 │  │
 │              │                └───────────────┼─────────────┼─────────────────┘  │
 │              │                                │             │                    │
 │  ┌───────────▼───────────┐    ┌───────────────▼─────────────▼────────────────┐  │
 │  │   Next.js 14 BFF      │    │         PostgreSQL 16 HA Cluster            │  │
 │  │   (App Router)        │    │  ┌──────────────┐    ┌──────────────┐       │  │
 │  │                       │    │  │   Primary     │    │   Standby    │       │  │
 │  │   - OIDC callback     │    │  │   :5432       │───►│   :5432      │       │  │
 │  │   - Token exchange    │    │  │               │    │  (streaming  │       │  │
 │  │   - Session cookie    │    │  │               │    │   replication)│      │  │
 │  │   - CSRF protection   │    │  └───────┬───────┘    └──────────────┘       │  │
 │  │   - Security headers  │    │          │                                   │  │
 │  │   - BFF API routes    │    │  ┌───────▼───────┐                           │  │
 │  │                       │    │  │   PgBouncer   │                           │  │
 │  │   Port 3000 (int)     │    │  │   :6432       │  Connection pool          │  │
 │  │                       │    │  │   200 max conn│  mode: transaction        │  │
 │  └───────────────────────┘    │  └───────────────┘                           │  │
 │                                └─────────────────────────────────────────────┘  │
 │                                                                                 │
 │  ┌────────────────────────────────────────────────────────────────────────────┐ │
 │  │  Audit Log Pipeline                                                       │ │
 │  │  Keycloak Event Listener SPI ──► Kafka (hg-audit-events) ──► Logstash    │ │
 │  │                                   :9092                       ──► ES      │ │
 │  └────────────────────────────────────────────────────────────────────────────┘ │
 │                                                                                 │
 └─────────────────────────────────────────────────────────────────────────────────┘
               │                                          │
               │ mTLS (internal certs)                    │ JWKS endpoint
               │ Port 8443                                │ (cached, verified)
 ══════════════╪══════════════════════════════════════════╪═════════════════════════
               │                                          │
 ┌─────────────▼──────────────────────────────────────────▼─────────────────────────┐
 │                                                                                   │
 │  ZONE 2: GATEWAY PLANE        K8s namespace: healthgate-gateway                   │
 │  ──────────────────────────────────────────────────────────────────────────────    │
 │  Docker network: hg-gateway-net (172.21.0.0/16)                                   │
 │                                                                                   │
 │  ┌────────────────────────────────────────────────────────────────────────────┐   │
 │  │   API Gateway (Envoy / Kong / custom middleware)                          │   │
 │  │                                                                            │   │
 │  │   Responsibilities:                                                        │   │
 │  │   1. JWT validation (RS256 signature, exp, iss, aud)                      │   │
 │  │   2. RBAC enforcement (check realm_access.roles, resource_access)         │   │
 │  │   3. Rate limiting (token bucket, per-client-id)                          │   │
 │  │   4. JWKS caching (refresh every 5 min, cache TTL 1 hr)                  │   │
 │  │   5. Request correlation (X-Request-Id propagation)                       │   │
 │  │   6. mTLS to Zone 3 backends                                              │   │
 │  │                                                                            │   │
 │  │   JWKS Cache: in-memory, refreshed from Zone 1 Keycloak                   │   │
 │  │   /.well-known/openid-configuration cached locally                         │   │
 │  │                                                                            │   │
 │  │   Port 8443 (from Zone 1)     Port 9443 (to Zone 3)                       │   │
 │  └─────────────────────┬──────────────────────────────────────────────────────┘   │
 │                        │                                                          │
 └────────────────────────┼──────────────────────────────────────────────────────────┘
                          │ mTLS :9443
                          │ TLS 1.3
 ═════════════════════════╪════════════════════════════════════════════════════════════
                          │
 ┌────────────────────────▼──────────────────────────────────────────────────────────┐
 │                                                                                   │
 │  ZONE 3: PHI DATA PLANE         K8s namespace: healthgate-phi                     │
 │  ──────────────────────────────────────────────────────────────────────────────    │
 │  Docker network: hg-phi-net (172.22.0.0/16)  [PRIVATE -- no internet egress]      │
 │                                                                                   │
 │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
 │  │ Clinical     │  │ Lab Results  │  │ Patient      │  │ Future       │          │
 │  │ Decision     │  │ Viewer       │  │ Messaging    │  │ Apps...      │          │
 │  │ Support      │  │              │  │              │  │              │          │
 │  │ :9443        │  │ :9443        │  │ :9443        │  │ :9443        │          │
 │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
 │         │                 │                 │                 │                    │
 │  ┌──────▼─────────────────▼─────────────────▼─────────────────▼───────────────┐   │
 │  │                    PHI Databases (PostgreSQL, MongoDB, etc.)               │   │
 │  │                    Contains Protected Health Information                    │   │
 │  │                    NEVER accessible from Zone 1                            │   │
 │  └────────────────────────────────────────────────────────────────────────────┘   │
 │                                                                                   │
 └───────────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Network Topology

**Docker Networks (Development -- `docker-compose`)**

| Network Name | Subnet | Purpose | Connected Services |
|---|---|---|---|
| `hg-auth-net` | `172.20.0.0/16` | Zone 1 internal communication | Keycloak, PostgreSQL, PgBouncer, Next.js BFF, Kafka |
| `hg-gateway-net` | `172.21.0.0/16` | Zone 2 gateway | API Gateway |
| `hg-phi-net` | `172.22.0.0/16` | Zone 3 PHI data plane (simulated) | Mock downstream apps |
| `hg-bridge` | `172.23.0.0/16` | Cross-zone bridge (controlled) | Ingress, Gateway (both legs) |

Network policies enforce:
- `hg-phi-net` cannot initiate connections to `hg-auth-net`
- `hg-auth-net` cannot initiate connections to `hg-phi-net`
- Only `hg-gateway-net` bridges the two, and only via defined ports

**Kubernetes Namespaces (Production)**

| Namespace | Purpose | Network Policy |
|---|---|---|
| `healthgate-auth` | Zone 1: Keycloak, PostgreSQL, PgBouncer, Next.js BFF, Kafka | Ingress from `healthgate-gateway` on 8443; egress to internet for SAML federation and SMTP only |
| `healthgate-gateway` | Zone 2: API Gateway / Envoy | Ingress from internet on 443; egress to `healthgate-auth` on 8443 and `healthgate-phi` on 9443 |
| `healthgate-phi` | Zone 3: Downstream apps + PHI databases | Ingress from `healthgate-gateway` on 9443 only; no internet egress; no access to `healthgate-auth` |
| `healthgate-observability` | ELK, Prometheus, Grafana | Ingress from all zones (metrics scraping); egress to PagerDuty, Slack webhooks |

### 2.3 Communication Patterns

| Source | Destination | Protocol | Port | Auth | Encryption |
|---|---|---|---|---|---|
| Browser | Ingress Controller | HTTPS | 443 | N/A (public) | TLS 1.3 |
| Ingress | Next.js BFF | HTTP | 3000 | Internal (k8s network policy) | Terminated at ingress |
| Ingress | Keycloak | HTTPS | 8080 | Internal | TLS 1.3 (re-encrypted) |
| Next.js BFF | Keycloak | HTTPS | 8080 | Service account / client_secret_post | mTLS |
| Keycloak | PgBouncer | PostgreSQL wire | 6432 | Username/password (Vault-sourced) | TLS 1.3 |
| PgBouncer | PostgreSQL | PostgreSQL wire | 5432 | Pass-through | TLS 1.3 |
| Keycloak | Kafka | Kafka protocol | 9092 | SASL/SCRAM-SHA-512 | TLS 1.3 |
| Kafka | Logstash | Kafka protocol | 9092 | SASL/SCRAM-SHA-512 | TLS 1.3 |
| Logstash | Elasticsearch | HTTPS | 9200 | API key | TLS 1.3 |
| Gateway | Keycloak JWKS | HTTPS | 8080 | N/A (public key endpoint) | TLS 1.3 |
| Gateway | Zone 3 apps | HTTPS | 9443 | mTLS (client cert) | TLS 1.3 |
| Keycloak | External IdP | HTTPS | 443 | SAML metadata | TLS 1.3 |
| Keycloak | SMTP | SMTPS | 465 | Username/password (Vault-sourced) | TLS 1.3 |
| Keycloak Pod 1 | Keycloak Pod 2 | ISPN (Infinispan) | 7800 | Symmetric key auth | Encrypted (JGroups ASYM_ENCRYPT) |

---

## 3. Component Architecture

### 3.a Keycloak (Identity Provider)

**Responsibility:** Central identity and access management. Handles all credential verification, MFA challenge/enrollment, OIDC/SAML protocol flows, session lifecycle, RBAC, brute-force protection, password policy enforcement, and audit event emission.

**Technology:** Keycloak 24.0+ (Quarkus distribution), running on OpenJDK 21.

**Interfaces:**

| Direction | Interface | Protocol | Consumers/Providers |
|---|---|---|---|
| Inbound | OIDC Authorization endpoint | HTTPS `/realms/{realm}/protocol/openid-connect/auth` | Browser (via SDK redirect) |
| Inbound | OIDC Token endpoint | HTTPS POST `/realms/{realm}/protocol/openid-connect/token` | Next.js BFF (back-channel) |
| Inbound | OIDC Userinfo endpoint | HTTPS GET `/realms/{realm}/protocol/openid-connect/userinfo` | Next.js BFF |
| Inbound | OIDC Logout endpoint | HTTPS `/realms/{realm}/protocol/openid-connect/logout` | Next.js BFF, SDK |
| Inbound | SAML SSO endpoint | HTTPS `/realms/{realm}/protocol/saml` | External IdPs |
| Inbound | Admin REST API | HTTPS `/admin/realms/{realm}/...` | Admin Console, SCIM extension |
| Inbound | JWKS endpoint | HTTPS `/.well-known/openid-configuration` | Gateway (Zone 2) |
| Outbound | JDBC to PostgreSQL | TCP :6432 (via PgBouncer) | PostgreSQL |
| Outbound | Kafka producer | TCP :9092 | Kafka (audit events) |
| Outbound | SMTP | TCP :465 | SMTP relay (password reset, notifications) |
| Outbound | External IdP | HTTPS :443 | Hospital AD/Okta (SAML) |
| Internal | Infinispan cluster | TCP :7800 | Other Keycloak pods |

**Data Touched:**
- Users table (read/write): username, email, first_name, last_name, enabled, created_timestamp
- Credentials table (read/write): hashed_password, otp_secret (encrypted), credential_type
- Sessions table (read/write): session_id, user_id, ip_address, started, last_access
- Events table (write): all audit events per FR14
- Realm configuration (read): policies, client configs, identity providers

**Keycloak Realm Configuration (key settings):**

```
Realm: healthgate-clinician
  - SSO Session Idle: 900 (15 min, configurable via ssoSessionIdleTimeout)
  - SSO Session Max: 43200 (12 hr, configurable via ssoSessionMaxLifespan)
  - Access Token Lifespan: 300 (5 min)
  - Client Session Idle: 900
  - Client Session Max: 43200
  - Refresh Token Max Reuse: 0 (single-use, rotation enabled)
  - Login Theme: healthgate
  - Brute Force Protection: enabled
    - maxFailureWaitSeconds: 900 (15 min initial)
    - maxDeltaTimeSeconds: 86400 (24 hr window)
    - failureFactor: 5 (attempts before lock)
    - permanentLockout: false
    - waitIncrementSeconds: 900
  - Password Policy: \"length(12) and upperCase(1) and lowerCase(1) and digits(1) and specialChars(1) and notUsername and passwordHistory(12) and maxLength(128)\"
  - OTP Policy:
    - type: totp
    - algorithm: HmacSHA1
    - digits: 6
    - period: 30
    - lookAheadWindow: 1
    - initialCounter: 0
  - Required Actions: CONFIGURE_TOTP (for all new users)
  - Events:
    - adminEventsEnabled: true
    - adminEventsDetailsEnabled: true
    - eventsEnabled: true
    - eventsExpiration: 196819200 (6 years 210 days in seconds)
    - eventsListeners: [\"jboss-logging\", \"healthgate-kafka-listener\"]
    - enabledEventTypes: [LOGIN, LOGIN_ERROR, LOGOUT, REGISTER, ...]

Realm: healthgate-patient
  - SSO Session Idle: 900 (15 min)
  - SSO Session Max: 1800 (30 min)
  - Refresh Token Lifespan: 1800 (30 min)
  - (All other policies same as clinician realm)
```

**Scaling Strategy:**
- Horizontal: 3 pods minimum (production), scaled via HPA
  - CPU target: 70%
  - Memory target: 80%
  - Max replicas: 10
- Infinispan distributed cache for session replication (no sticky sessions required)
- JDBC session persistence as fallback (sessions survive full cluster restart)
- Resource limits per pod:
  - requests: cpu=500m, memory=1Gi
  - limits: cpu=2000m, memory=2Gi

### 3.b PostgreSQL (Auth Database)

**Responsibility:** Persistent storage for all Keycloak data: user accounts, credentials, sessions, events, realm configuration, client definitions, and role mappings. Contains ZERO PHI.

**Technology:** PostgreSQL 16.x with Patroni for HA orchestration.

**Interfaces:**

| Direction | Interface | Protocol | Consumers |
|---|---|---|---|
| Inbound | SQL queries | PostgreSQL wire :5432 | PgBouncer |
| Inbound | Streaming replication | PostgreSQL replication :5432 | Standby replica |
| Outbound | WAL archiving | S3-compatible / GCS | Object storage (backups) |

**Data Touched:** All Keycloak schema tables. See Section 4 for detailed schema.

**Data Classification:**
- PII: user_entity.email, user_entity.first_name, user_entity.last_name
- Security: credential.secret_data (encrypted), credential.credential_data
- Operational: event_entity.*, user_session.*, offline_user_session.*

**Scaling Strategy:**
- Vertical initially: 4 vCPU, 16 GB RAM, 500 GB NVMe SSD (gp3 or equivalent)
- Read replicas for reporting queries (admin console, audit log search): 1 async replica
- Synchronous standby for HA (Patroni)
- PgBouncer connection pool:
  - `default_pool_size`: 25 per database
  - `max_client_conn`: 400
  - `max_db_connections`: 200
  - `pool_mode`: transaction
  - `server_idle_timeout`: 600
  - `server_lifetime`: 3600

### 3.c Next.js Frontend/BFF

**Responsibility:** Dual role. (1) Server-side rendered frontend for all authentication screens (login, register, MFA, password reset, session expired, account locked). (2) Backend-for-Frontend (BFF) layer that acts as a confidential OIDC client, performs token exchange with Keycloak on the back channel, sets HttpOnly session cookies, enforces CSRF protection, applies security headers, and provides API endpoints for the React SDK.

**Technology:** Next.js 14 (App Router), TypeScript 5.x, shadcn/ui (New York style), React Hook Form + Zod validation.

**Interfaces:**

| Direction | Interface | Protocol | Consumers/Providers |
|---|---|---|---|
| Inbound | Auth pages | HTTPS GET `/login`, `/register`, `/login/mfa`, etc. | Browser |
| Inbound | BFF API | HTTPS POST `/api/auth/callback` | Browser (OIDC callback) |
| Inbound | BFF API | HTTPS POST `/api/auth/refresh` | React SDK (silent refresh) |
| Inbound | BFF API | HTTPS GET `/api/auth/session` | React SDK (session status) |
| Inbound | BFF API | HTTPS GET `/api/auth/csrf` | React SDK (CSRF token) |
| Inbound | BFF API | HTTPS POST `/api/auth/logout` | React SDK (logout) |
| Inbound | Health checks | HTTP GET `/healthz`, `/readyz` | Kubernetes probes |
| Outbound | OIDC token exchange | HTTPS POST to Keycloak `/token` | Keycloak |
| Outbound | OIDC userinfo | HTTPS GET to Keycloak `/userinfo` | Keycloak |
| Outbound | OIDC logout | HTTPS GET to Keycloak `/logout` | Keycloak |

**Data Touched:**
- Cookies (read/write): `hg-access-token` (encrypted, HttpOnly), `hg-refresh-token` (encrypted, HttpOnly), `hg-csrf` (HttpOnly), `hg-pkce-verifier` (short-lived, HttpOnly), `hg-device-trust` (HttpOnly)
- In-memory: PKCE code_verifier (during auth flow only), CSRF token nonces
- Never touches database directly

**Cookie Architecture:**

| Cookie Name | Content | HttpOnly | Secure | SameSite | Max-Age | Path |
|---|---|---|---|---|---|---|
| `hg-access-token` | AES-256-GCM encrypted JWT | Yes | Yes | Strict | 300 (5 min) | `/` |
| `hg-refresh-token` | AES-256-GCM encrypted JWT | Yes | Yes | Strict | Matches realm config | `/api/auth` |
| `hg-csrf` | Random 32-byte hex | Yes | Yes | Strict | Session | `/` |
| `hg-pkce-verifier` | Random 43-byte base64url | Yes | Yes | Strict | 300 (5 min) | `/api/auth/callback` |
| `hg-device-trust` | HMAC-SHA256(user_id + device_fp) | Yes | Yes | Strict | 2592000 (30 days) | `/` |
| `hg-session-meta` | JSON {idleStart, maxStart} | Yes | Yes | Strict | Session | `/` |

**Encryption key for cookies:** Derived from a 256-bit master key stored in Vault, rotated every 90 days. Previous key retained for 30 days for decryption of in-flight cookies.

**Scaling Strategy:**
- Fully stateless (all state in cookies or Keycloak)
- Horizontal via HPA:
  - CPU target: 70%
  - Max replicas: 50
  - Resource limits per pod: requests cpu=250m memory=512Mi, limits cpu=1000m memory=1Gi
- CDN for static assets (`/_next/static/*`): Cache-Control: public, max-age=31536000, immutable
- HTML pages: no CDN caching (dynamic per-request with security headers)

### 3.d API Gateway Layer

**Responsibility:** Stateless enforcement layer between the authenticated client and downstream PHI applications. Validates JWT access tokens, enforces RBAC based on token claims, applies per-client rate limiting, propagates request correlation IDs, and terminates/initiates mTLS.

**Technology:** Envoy Proxy 1.29+ (or Kong 3.x as alternative). Configured declaratively via Envoy xDS or Kong declarative config.

**Interfaces:**

| Direction | Interface | Protocol | Consumers/Providers |
|---|---|---|---|
| Inbound | API requests | HTTPS :443 | Browser (with access token in cookie, extracted by BFF) |
| Outbound | JWKS fetch | HTTPS to Keycloak :8080 | Keycloak (periodic, 5-min interval) |
| Outbound | Upstream routing | mTLS :9443 | Zone 3 applications |

**JWT Validation Logic (pseudocode):**
```
1. Extract JWT from Authorization header (Bearer token) or forwarded from BFF
2. Decode header, extract \"kid\" (key ID)
3. Look up \"kid\" in local JWKS cache
4. If not found: refresh JWKS from Keycloak, retry lookup
5. If still not found: REJECT (401 Unauthorized)
6. Verify RS256 signature using public key
7. Check \"exp\" > current_time (with 5-second clock skew tolerance)
8. Check \"iss\" == \"https://auth.googlehealth.com/realms/{expected-realm}\"
9. Check \"aud\" contains the expected client_id
10. Check \"realm_access.roles\" or \"resource_access.{client_id}.roles\" for required roles
11. If any check fails: REJECT (401 or 403)
12. Else: FORWARD request to upstream with X-User-Id, X-User-Roles, X-Request-Id headers
```

**JWKS Cache Policy:**
- Refresh interval: 300 seconds (5 minutes)
- Cache TTL: 3600 seconds (1 hour) -- serves stale if Keycloak unreachable
- On-demand refresh: triggered by unknown `kid` in token
- This ensures existing sessions survive a Zone 1 outage for up to 1 hour (access tokens expire in 5 minutes, but cached JWKS allows validation)

**Rate Limiting:**
- Per client_id: 1000 requests/minute (configurable)
- Per IP: 100 requests/minute (unauthenticated), 2000 requests/minute (authenticated)
- HTTP 429 response with `Retry-After` header

**Scaling Strategy:**
- Horizontal via HPA: CPU target 60%, max 20 replicas
- Resource limits: requests cpu=250m memory=256Mi, limits cpu=1000m memory=512Mi
- Envoy is extremely lightweight; single pod handles ~10K concurrent connections

### 3.e Audit Log Pipeline

**Responsibility:** Capture every authentication event from Keycloak in real time, transport it reliably to long-term storage, and provide search and reporting capabilities. Events must be tamper-evident and retained for 6 years 210 days per HIPAA 164.312(b) and 164.530(j).

**Technology:**
- Event source: Keycloak custom Event Listener SPI (`healthgate-kafka-listener`)
- Transport: Apache Kafka 3.7+ (topic: `hg-audit-events`, 3 partitions, replication factor 3)
- Transform: Logstash 8.x (enrichment: GeoIP for IP addresses, field normalization)
- Storage: Elasticsearch 8.x (index pattern: `healthgate-audit-YYYY.MM`, ILM policy)
- Visualization: Kibana 8.x + custom Grafana dashboards
- Export: Admin console API for JSON/CSV export

**Audit Event Schema (final format in Elasticsearch):**

```json
{
  \"timestamp\": \"2026-03-01T14:30:00.000Z\",
  \"event_type\": \"LOGIN_SUCCESS\",
  \"user_id\": \"550e8400-e29b-41d4-a716-446655440000\",
  \"username\": \"sarah.chen@googlehealth.com\",
  \"ip_address\": \"10.0.1.42\",
  \"geo\": {
    \"city\": \"San Jose\",
    \"country\": \"US\",
    \"lat\": 37.3382,
    \"lon\": -121.8863
  },
  \"user_agent\": \"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ...\",
  \"session_id\": \"a1b2c3d4-e5f6-7890-abcd-ef1234567890\",
  \"client_id\": \"clinical-decision-support\",
  \"realm\": \"healthgate-clinician\",
  \"auth_method\": \"password+totp\",
  \"result\": \"success\",
  \"details\": {
    \"redirect_uri\": \"https://cds.googlehealth.com/callback\",
    \"auth_flow\": \"authorization_code_pkce\"
  },
  \"source_zone\": \"zone-1\",
  \"correlation_id\": \"req-uuid-1234567890\",
  \"hash_chain\": {
    \"current_hash\": \"sha256:abc123...\",
    \"previous_hash\": \"sha256:def456...\"
  }
}
```

**Tamper Evidence (Hash Chain):**
Each audit event batch (every 1 second or 100 events, whichever comes first) includes a SHA-256 hash chain. The hash of each batch incorporates the previous batch's hash. This creates a verifiable chain -- any deletion or modification of a batch breaks the chain and is detectable. An independent integrity verifier runs hourly, comparing the chain in Elasticsearch against a separate append-only log stored in object storage (GCS/S3).

**Elasticsearch ILM Policy:**

| Phase | Duration | Action |
|---|---|---|
| Hot | 0-30 days | Primary shards on SSD, 1 replica |
| Warm | 30-365 days | Force merge to 1 segment, move to HDD, 1 replica |
| Cold | 1-6 years | Freeze index, searchable snapshot to object storage, 0 replicas |
| Delete | 6 years 210 days | Delete index |

**Scaling Strategy:**
- Kafka: 3-node cluster minimum, auto-partition rebalancing
- Logstash: 2 instances for HA (active-active)
- Elasticsearch: 3 data nodes (hot), 2 data nodes (warm), cold tier on object storage
- Kibana: 2 instances behind load balancer

### 3.f Admin Console

**Responsibility:** Web-based administrative interface for user lifecycle management, policy configuration, compliance reporting, and system monitoring. Built as a custom layer on top of Keycloak's Admin REST API (the default Keycloak admin console is not exposed to end-user admins).

**Technology:** Next.js 14 (shared codebase with auth frontend, different route group), shadcn/ui, TanStack Table for data grids, TanStack Query for server state management.

**Interfaces:**

| Direction | Interface | Protocol | Consumers/Providers |
|---|---|---|---|
| Inbound | Admin pages | HTTPS `/admin/*` | Admin users (James Park, Dr. Robert Kim) |
| Outbound | Keycloak Admin API | HTTPS `/admin/realms/{realm}/*` | Keycloak |
| Outbound | Elasticsearch | HTTPS :9200 | Elasticsearch (audit log queries) |
| Outbound | Report generation | Internal | PDF generation service (headless Chromium or similar) |

**RBAC for Admin Console:**
- `healthgate-admin` realm role: Full access to user management, policy, and reports
- `auditor` realm role: Read-only access to audit logs and compliance reports
- All other roles: no admin console access (HTTP 403)

**Data Touched:**
- Keycloak Admin API: user CRUD, role management, session management, realm settings
- Elasticsearch: audit log search and aggregation
- Never touches PHI databases

**Scaling Strategy:**
- Same deployment as Next.js BFF (shared pod)
- Admin traffic is low volume (10-50 concurrent admins); no separate scaling needed
- Report generation offloaded to background jobs (K8s Job resource) for large date ranges

---

## 4. Data Architecture

### 4.1 Auth Database Schema (Zone 1 -- PostgreSQL)

Keycloak manages its own schema. The following documents the key tables relevant to HealthGate's requirements. Custom extensions are marked with `[CUSTOM]`.

```
┌─────────────────────────────────────────────────────────────────┐
│                    Keycloak Core Schema                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  user_entity                                                     │
│  ├── id                  UUID PRIMARY KEY                        │
│  ├── email               VARCHAR(255) UNIQUE NOT NULL            │
│  ├── email_verified      BOOLEAN DEFAULT FALSE                   │
│  ├── enabled             BOOLEAN DEFAULT TRUE                    │
│  ├── first_name          VARCHAR(255)                            │
│  ├── last_name           VARCHAR(255)                            │
│  ├── realm_id            VARCHAR(36) FK → realm.id               │
│  ├── username            VARCHAR(255)                            │
│  ├── created_timestamp   BIGINT                                  │
│  └── INDEX idx_user_email (email, realm_id)                      │
│                                                                  │
│  credential                                                      │
│  ├── id                  UUID PRIMARY KEY                        │
│  ├── user_id             UUID FK → user_entity.id                │
│  ├── type                VARCHAR(255) [password, otp, webauthn]  │
│  ├── secret_data         TEXT (encrypted JSON)                   │
│  │   └── For password: {\"value\":\"$argon2id$...\", \"salt\":\"...\"}   │
│  │   └── For OTP: {\"value\":\"BASE32SECRET\", \"digits\":6,          │
│  │                  \"period\":30, \"algorithm\":\"HmacSHA1\"}         │
│  ├── credential_data     TEXT (JSON metadata)                    │
│  ├── created_date        BIGINT                                  │
│  └── priority            INT                                     │
│                                                                  │
│  user_session                                                    │
│  ├── id                  VARCHAR(36) PRIMARY KEY                 │
│  ├── user_id             VARCHAR(36) FK → user_entity.id         │
│  ├── realm_id            VARCHAR(36) FK → realm.id               │
│  ├── ip_address          VARCHAR(255)                            │
│  ├── auth_method         VARCHAR(255)                            │
│  ├── started             INT (epoch seconds)                     │
│  ├── last_session_refresh INT (epoch seconds)                    │
│  ├── broker_session_id   VARCHAR(36) (for SSO)                   │
│  └── INDEX idx_session_user (user_id, realm_id)                  │
│                                                                  │
│  event_entity                                                    │
│  ├── id                  VARCHAR(36) PRIMARY KEY                 │
│  ├── time                BIGINT (epoch milliseconds)             │
│  ├── type                VARCHAR(255)                            │
│  ├── realm_id            VARCHAR(36)                             │
│  ├── client_id           VARCHAR(255)                            │
│  ├── user_id             VARCHAR(255)                            │
│  ├── session_id          VARCHAR(255)                            │
│  ├── ip_address          VARCHAR(255)                            │
│  ├── details_json        TEXT                                    │
│  ├── error               VARCHAR(255)                            │
│  └── INDEX idx_event_time_type (realm_id, time, type)            │
│                                                                  │
│  user_role_mapping                                               │
│  ├── user_id             UUID FK → user_entity.id                │
│  ├── role_id             UUID FK → keycloak_role.id              │
│  └── PRIMARY KEY (user_id, role_id)                              │
│                                                                  │
│  keycloak_role                                                   │
│  ├── id                  UUID PRIMARY KEY                        │
│  ├── name                VARCHAR(255) NOT NULL                   │
│  ├── realm_id            VARCHAR(36) FK → realm.id               │
│  ├── client              VARCHAR(36) (NULL for realm roles)      │
│  ├── client_role         BOOLEAN                                 │
│  └── description         VARCHAR(255)                            │
│                                                                  │
│  [CUSTOM] trusted_device                                         │
│  ├── id                  UUID PRIMARY KEY                        │
│  ├── user_id             UUID FK → user_entity.id                │
│  ├── device_fingerprint  VARCHAR(64) (SHA-256 hash)              │
│  ├── user_agent_family   VARCHAR(255)                            │
│  ├── created_at          TIMESTAMP WITH TIME ZONE                │
│  ├── expires_at          TIMESTAMP WITH TIME ZONE                │
│  ├── last_used_at        TIMESTAMP WITH TIME ZONE                │
│  └── INDEX idx_trusted_user (user_id)                            │
│                                                                  │
│  [CUSTOM] device_login_history                                   │
│  ├── id                  UUID PRIMARY KEY                        │
│  ├── user_id             UUID FK → user_entity.id                │
│  ├── ip_address          VARCHAR(45)                             │
│  ├── ip_subnet_24        VARCHAR(18) (/24 prefix)                │
│  ├── user_agent_family   VARCHAR(255)                            │
│  ├── geo_city            VARCHAR(255)                            │
│  ├── geo_country         VARCHAR(2)                              │
│  ├── first_seen_at       TIMESTAMP WITH TIME ZONE                │
│  ├── last_seen_at        TIMESTAMP WITH TIME ZONE                │
│  └── INDEX idx_device_history_user (user_id, last_seen_at)       │
│                                                                  │
│  [CUSTOM] recovery_code                                          │
│  ├── id                  UUID PRIMARY KEY                        │
│  ├── user_id             UUID FK → user_entity.id                │
│  ├── code_hash           VARCHAR(72) (bcrypt, cost 12)           │
│  ├── used                BOOLEAN DEFAULT FALSE                   │
│  ├── used_at             TIMESTAMP WITH TIME ZONE                │
│  ├── created_at          TIMESTAMP WITH TIME ZONE                │
│  └── INDEX idx_recovery_user (user_id, used)                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 Data Location by Zone

| Data Category | Zone | Storage | Contains PHI? |
|---|---|---|---|
| User accounts (email, name, UUID) | Zone 1 | PostgreSQL (auth-db) | No (PII, not PHI) |
| Hashed passwords (bcrypt/Argon2) | Zone 1 | PostgreSQL (auth-db) | No |
| MFA secrets (encrypted TOTP seed) | Zone 1 | PostgreSQL (auth-db) | No |
| Recovery codes (bcrypt hashed) | Zone 1 | PostgreSQL (auth-db) | No |
| Session metadata (IP, user agent, timestamps) | Zone 1 | PostgreSQL + Infinispan | No |
| Audit events | Zone 1 | PostgreSQL (short-term), Elasticsearch (long-term) | No |
| Trusted device fingerprints | Zone 1 | PostgreSQL (auth-db) | No |
| Device login history | Zone 1 | PostgreSQL (auth-db) | No |
| Realm/client configuration | Zone 1 | PostgreSQL (auth-db) | No |
| OIDC tokens (in transit) | Zone 1/2 | Memory only (cookies encrypted at rest) | No |
| JWKS public keys (cached) | Zone 2 | Gateway in-memory cache | No |
| Patient records, diagnoses, medications | Zone 3 | Application databases | **YES** |
| Lab results, clinical notes | Zone 3 | Application databases | **YES** |

### 4.3 Data Classification

| Classification | Examples | Handling Requirements |
|---|---|---|
| **PHI** (Protected Health Information) | Diagnoses, medications, lab results, treatment plans | NEVER stored in Zone 1. NEVER present in auth flows, error messages, logs, or tokens. |
| **PII** (Personally Identifiable Information) | Name, email address | Stored in Zone 1 auth-db. Encrypted at rest. Anonymized on user deletion. |
| **Security** | Password hashes, MFA secrets, recovery codes, signing keys | Stored in Zone 1 auth-db. AES-256 encrypted at rest. Additional application-level encryption for MFA secrets. Never logged. |
| **Operational** | Timestamps, IP addresses, user agents, session IDs | Stored in Zone 1. Used for audit logging and analytics. Retained per HIPAA schedule. |

### 4.4 Encryption at Rest

| Layer | Mechanism | Algorithm | Key Management |
|---|---|---|---|
| Disk/volume | dm-crypt/LUKS (bare metal) or cloud-native encryption (GKE persistent disk encryption, AWS EBS encryption) | AES-256-XTS | Cloud KMS (auto-rotation annually) |
| PostgreSQL | Transparent Data Encryption via pgcrypto extension for sensitive columns, plus volume-level encryption | AES-256-GCM (column-level) | Master key in Vault, DEKs rotated every 90 days |
| Elasticsearch | Repository-level encryption for snapshots; node-level encryption via encrypted volumes | AES-256 | Cloud KMS |
| Keycloak MFA secrets | Application-level encryption before database storage (Keycloak's built-in vault SPI) | AES-256-GCM | Vault transit engine |
| Cookie payloads | AES-256-GCM encryption in Next.js BFF before setting cookies | AES-256-GCM | Cookie encryption key in Vault |

### 4.5 Encryption in Transit

All inter-component communication uses TLS 1.3 (fallback to TLS 1.2 minimum). Cipher suites:

```
TLS_AES_256_GCM_SHA384 (preferred)
TLS_CHACHA20_POLY1305_SHA256
TLS_AES_128_GCM_SHA256
```

No CBC cipher suites. No SSLv3, TLS 1.0, or TLS 1.1. HSTS enforced with `max-age=31536000; includeSubDomains; preload`.

### 4.6 Key Management Strategy

| Key Type | Storage | Rotation | Grace Period |
|---|---|---|---|
| Keycloak RS256 signing key (realm keys) | Vault transit engine | 90 days (automated) | 30 days (old key valid for verification) |
| PostgreSQL TDE master key | Cloud KMS | 365 days (automated) | Seamless (KMS handles re-encryption) |
| Cookie encryption key | Vault KV v2 | 90 days (automated) | 30 days (old key retained for decryption) |
| mTLS certificates (inter-zone) | cert-manager (K8s) with Vault PKI backend | 30 days (automated) | 7 days overlap |
| TLS certificates (external) | Let's Encrypt via cert-manager | 60 days (automated) | 30 days (auto-renewal at 30 days before expiry) |
| Kafka SASL credentials | Vault KV v2 | 180 days | Dual credentials during rotation window |
| PostgreSQL credentials | Vault database engine | 24 hours (dynamic) | Previous credential valid for 5 minutes |

**Emergency Key Rotation:** All signing keys can be rotated ad-hoc in under 5 minutes via a documented runbook. The runbook triggers: (1) Vault generates new key, (2) Keycloak picks up new key via SPI, (3) old key remains valid for verification during grace period, (4) monitoring confirms new key is in use.

---

## 5. Authentication Flows (Detailed)

### 5.a Login Flow (Email + Password + MFA + Token + Session)

```
 Browser (SDK)              Next.js BFF               Keycloak               PostgreSQL
     │                          │                        │                       │
     │  1. GET /login           │                        │                       │
     │ ────────────────────────►│                        │                       │
     │  2. Render login page    │                        │                       │
     │ ◄────────────────────────│                        │                       │
     │  (SSR HTML + JS bundle)  │                        │                       │
     │                          │                        │                       │
     │  3. User enters email    │                        │                       │
     │     + password, clicks   │                        │                       │
     │     \"Continue\"           │                        │                       │
     │                          │                        │                       │
     │  4. Client-side Zod      │                        │                       │
     │     validation (format)  │                        │                       │
     │                          │                        │                       │
     │  5. Generate PKCE:       │                        │                       │
     │     code_verifier (43B)  │                        │                       │
     │     code_challenge =     │                        │                       │
     │     BASE64URL(SHA256(    │                        │                       │
     │       code_verifier))    │                        │                       │
     │                          │                        │                       │
     │  6. Store code_verifier  │                        │                       │
     │     in hg-pkce-verifier  │                        │                       │
     │     cookie (HttpOnly,    │                        │                       │
     │     5 min TTL)           │                        │                       │
     │                          │                        │                       │
     │  7. POST /api/auth/login │                        │                       │
     │     {email, password,    │                        │                       │
     │      csrf_token}         │                        │                       │
     │ ────────────────────────►│                        │                       │
     │                          │                        │                       │
     │                          │  8. POST /realms/      │                       │
     │                          │     {realm}/protocol/  │                       │
     │                          │     openid-connect/    │                       │
     │                          │     token              │                       │
     │                          │  (direct access grant  │                       │
     │                          │   OR authorization     │                       │
     │                          │   code initiation)     │                       │
     │                          │ ──────────────────────►│                       │
     │                          │                        │                       │
     │                          │                        │  9. SELECT credential │
     │                          │                        │     WHERE user_id = ? │
     │                          │                        │ ─────────────────────►│
     │                          │                        │                       │
     │                          │                        │  10. Verify bcrypt    │
     │                          │                        │      hash(password,   │
     │                          │                        │      stored_hash)     │
     │                          │                        │ ◄─────────────────────│
     │                          │                        │                       │
     │                          │                        │  11. Check brute-     │
     │                          │                        │      force counter    │
     │                          │                        │      (Infinispan)     │
     │                          │                        │                       │
     │                          │  12. IF password OK    │                       │
     │                          │      AND MFA enabled:  │                       │
     │                          │      Return            │                       │
     │                          │      \"mfa_required\"    │                       │
     │                          │      + partial session │                       │
     │                          │ ◄──────────────────────│                       │
     │                          │                        │                       │
     │  13. Redirect to         │                        │                       │
     │      /login/mfa          │                        │                       │
     │ ◄────────────────────────│                        │                       │
     │                          │                        │                       │
     │  14. User enters TOTP    │                        │                       │
     │      code (6 digits)     │                        │                       │
     │      InputOTP auto-      │                        │                       │
     │      submits on 6th      │                        │                       │
     │                          │                        │                       │
     │  15. POST /api/auth/mfa  │                        │                       │
     │      {totp_code, csrf}   │                        │                       │
     │ ────────────────────────►│                        │                       │
     │                          │                        │                       │
     │                          │  16. POST /realms/     │                       │
     │                          │      {realm}/          │                       │
     │                          │      login-actions/    │                       │
     │                          │      authenticate      │                       │
     │                          │      {otp: code}       │                       │
     │                          │ ──────────────────────►│                       │
     │                          │                        │                       │
     │                          │                        │  17. Validate TOTP    │
     │                          │                        │      (check +/- 1    │
     │                          │                        │       time step)      │
     │                          │                        │                       │
     │                          │  18. IF TOTP OK:       │                       │
     │                          │      Authorization     │                       │
     │                          │      code returned     │                       │
     │                          │ ◄──────────────────────│                       │
     │                          │                        │                       │
     │                          │  19. POST /token       │                       │
     │                          │      grant_type=       │                       │
     │                          │      authorization_code│                       │
     │                          │      + code_verifier   │                       │
     │                          │      + client_secret   │                       │
     │                          │ ──────────────────────►│                       │
     │                          │                        │                       │
     │                          │                        │  20. Verify PKCE:     │
     │                          │                        │  BASE64URL(SHA256(    │
     │                          │                        │    code_verifier))    │
     │                          │                        │  == code_challenge    │
     │                          │                        │                       │
     │                          │                        │  21. Create session   │
     │                          │                        │ ─────────────────────►│
     │                          │                        │  INSERT user_session  │
     │                          │                        │                       │
     │                          │                        │  22. Log event:       │
     │                          │                        │  LOGIN_SUCCESS        │
     │                          │                        │ ─────────────────────►│
     │                          │                        │  Kafka → Logstash     │
     │                          │                        │  → Elasticsearch      │
     │                          │                        │                       │
     │                          │  23. Receive tokens:   │                       │
     │                          │      access_token (JWT)│                       │
     │                          │      refresh_token     │                       │
     │                          │      id_token          │                       │
     │                          │ ◄──────────────────────│                       │
     │                          │                        │                       │
     │                          │  24. Encrypt tokens    │                       │
     │                          │      with AES-256-GCM  │                       │
     │                          │      Set cookies:      │                       │
     │                          │      hg-access-token   │                       │
     │                          │      hg-refresh-token  │                       │
     │                          │      hg-session-meta   │                       │
     │                          │                        │                       │
     │  25. Set-Cookie headers  │                        │                       │
     │      + redirect to       │                        │                       │
     │      /dashboard (or      │                        │                       │
     │      original redirect)  │                        │                       │
     │ ◄────────────────────────│                        │                       │
     │                          │                        │                       │
     │  26. GET /dashboard      │                        │                       │
     │      (with cookies)      │                        │                       │
     │  ──────────────────────►│                        │                       │
     │                          │                        │                       │
     │  27. Middleware: decrypt  │                        │                       │
     │      hg-access-token,    │                        │                       │
     │      verify JWT exp/sig  │                        │                       │
     │      → Allow rendering   │                        │                       │
     │                          │                        │                       │
     │  28. Render protected    │                        │                       │
     │      content             │                        │                       │
     │ ◄────────────────────────│                        │                       │
     │                          │                        │                       │
```

### 5.b SSO / SAML Flow

```
 Browser                  Next.js BFF            Keycloak              External IdP
     │                        │                      │                (Hospital AD)
     │  1. GET /login         │                      │                     │
     │ ──────────────────────►│                      │                     │
     │  2. User clicks        │                      │                     │
     │     \"SSO / SAML\"       │                      │                     │
     │                        │                      │                     │
     │  3. POST /api/auth/sso │                      │                     │
     │     {email_domain}     │                      │                     │
     │ ──────────────────────►│                      │                     │
     │                        │  4. Lookup IdP by     │                     │
     │                        │     email domain      │                     │
     │                        │     alias in realm    │                     │
     │                        │ ────────────────────►│                     │
     │                        │                      │                     │
     │  5. Redirect 302 to    │                      │                     │
     │     Keycloak SAML SP   │                      │                     │
     │     initiation         │                      │                     │
     │ ◄──────────────────────│                      │                     │
     │                        │                      │                     │
     │  6. GET /realms/{realm}/protocol/saml/clients/{client}             │
     │ ─────────────────────────────────────────────►│                     │
     │                        │                      │                     │
     │  7. Keycloak generates  │                      │                     │
     │     SAML AuthnRequest   │                      │                     │
     │     (signed RSA-SHA256) │                      │                     │
     │                        │                      │                     │
     │  8. Redirect 302 to external IdP SSO URL with AuthnRequest        │
     │ ◄────────────────────────────────────────────│                     │
     │                        │                      │                     │
     │  9. POST to external IdP SSO endpoint                              │
     │ ─────────────────────────────────────────────────────────────────►│
     │                        │                      │                     │
     │  10. User authenticates at hospital IdP                            │
     │      (hospital's own login page)                                   │
     │ ◄───────────────────────────────────────────────────────────────── │
     │                        │                      │                     │
     │  11. External IdP sends SAML Response (signed, optionally encrypted)
     │      via browser POST to Keycloak ACS URL                          │
     │ ─────────────────────────────────────────────►│                     │
     │                        │                      │                     │
     │                        │                      │  12. Validate SAML  │
     │                        │                      │      Response:      │
     │                        │                      │      - Signature    │
     │                        │                      │        (RSA-SHA256) │
     │                        │                      │      - Audience     │
     │                        │                      │      - NotBefore/   │
     │                        │                      │        NotOnOrAfter │
     │                        │                      │      - Extract      │
     │                        │                      │        NameID +     │
     │                        │                      │        attributes   │
     │                        │                      │                     │
     │                        │                      │  13. IF user not in │
     │                        │                      │      Keycloak:      │
     │                        │                      │      First Login    │
     │                        │                      │      Flow → create  │
     │                        │                      │      shadow account │
     │                        │                      │                     │
     │                        │                      │  14. Create session,│
     │                        │                      │      issue auth     │
     │                        │                      │      code           │
     │                        │                      │                     │
     │  15. Redirect to BFF callback with auth code  │                     │
     │ ◄────────────────────────────────────────────│                     │
     │                        │                      │                     │
     │  16-28. Same as Login Flow steps 19-28 (token exchange, cookies)    │
     │                        │                      │                     │
```

### 5.c Token Refresh Flow

```
 Browser (SDK)              Next.js BFF               Keycloak
     │                          │                        │
     │  1. SDK timer fires      │                        │
     │     (access_token exp    │                        │
     │      - 60 seconds)       │                        │
     │                          │                        │
     │  2. POST /api/auth/      │                        │
     │     refresh              │                        │
     │     Cookie: hg-refresh-  │                        │
     │     token (encrypted)    │                        │
     │ ────────────────────────►│                        │
     │                          │                        │
     │                          │  3. Decrypt refresh    │
     │                          │     token from cookie  │
     │                          │                        │
     │                          │  4. POST /realms/      │
     │                          │     {realm}/protocol/  │
     │                          │     openid-connect/    │
     │                          │     token              │
     │                          │     grant_type=        │
     │                          │     refresh_token      │
     │                          │     refresh_token=     │
     │                          │     {decrypted_RT}     │
     │                          │     client_id=         │
     │                          │     {client_id}        │
     │                          │     client_secret=     │
     │                          │     {client_secret}    │
     │                          │ ──────────────────────►│
     │                          │                        │
     │                          │                        │  5. Validate RT:
     │                          │                        │     - Not expired
     │                          │                        │     - Not revoked
     │                          │                        │     - Max reuse = 0
     │                          │                        │       (single-use)
     │                          │                        │
     │                          │                        │  6. Issue new:
     │                          │                        │     - access_token
     │                          │                        │     - refresh_token
     │                          │                        │       (rotated)
     │                          │                        │     - id_token
     │                          │                        │
     │                          │                        │  7. Invalidate old
     │                          │                        │     refresh_token
     │                          │                        │
     │                          │                        │  8. Log event:
     │                          │                        │     TOKEN_REFRESH
     │                          │                        │
     │                          │  9. Receive new tokens │
     │                          │ ◄──────────────────────│
     │                          │                        │
     │                          │  10. Encrypt new       │
     │                          │      tokens, set new   │
     │                          │      cookies           │
     │                          │                        │
     │  11. Set-Cookie:         │                        │
     │      hg-access-token     │                        │
     │      hg-refresh-token    │                        │
     │      (new values)        │                        │
     │ ◄────────────────────────│                        │
     │                          │                        │
     │  12. SDK updates         │                        │
     │      internal state,     │                        │
     │      resets refresh      │                        │
     │      timer               │                        │
     │                          │                        │
     │  FAILURE PATH:           │                        │
     │                          │                        │
     │                          │  F1. Keycloak returns  │
     │                          │      400 invalid_grant │
     │                          │      (RT expired or    │
     │                          │       revoked)         │
     │                          │ ◄──────────────────────│
     │                          │                        │
     │  F2. 401 + clear all     │                        │
     │      cookies             │                        │
     │ ◄────────────────────────│                        │
     │                          │                        │
     │  F3. SDK calls           │                        │
     │      onAuthError(),      │                        │
     │      redirects to        │                        │
     │      /session-expired    │                        │
     │                          │                        │
```

### 5.d Logout Flow (Local + Keycloak + All Sessions)

```
 Browser (SDK)              Next.js BFF               Keycloak            Other RP Apps
     │                          │                        │                     │
     │  1. User clicks          │                        │                     │
     │     \"Sign out\"           │                        │                     │
     │                          │                        │                     │
     │  2. POST /api/auth/      │                        │                     │
     │     logout               │                        │                     │
     │     {csrf_token}         │                        │                     │
     │ ────────────────────────►│                        │                     │
     │                          │                        │                     │
     │                          │  3. Decrypt id_token   │                     │
     │                          │     from cookie        │                     │
     │                          │                        │                     │
     │                          │  4. GET /realms/       │                     │
     │                          │     {realm}/protocol/  │                     │
     │                          │     openid-connect/    │                     │
     │                          │     logout?            │                     │
     │                          │     id_token_hint=     │                     │
     │                          │     {id_token}&        │                     │
     │                          │     post_logout_       │                     │
     │                          │     redirect_uri=      │                     │
     │                          │     {login_url}        │                     │
     │                          │ ──────────────────────►│                     │
     │                          │                        │                     │
     │                          │                        │  5. Terminate       │
     │                          │                        │     Keycloak        │
     │                          │                        │     session         │
     │                          │                        │                     │
     │                          │                        │  6. Back-channel    │
     │                          │                        │     logout to all   │
     │                          │                        │     RPs with active │
     │                          │                        │     sessions:       │
     │                          │                        │     POST /api/auth/ │
     │                          │                        │     backchannel-    │
     │                          │                        │     logout          │
     │                          │                        │ ───────────────────►│
     │                          │                        │                     │
     │                          │                        │                     │  7. RP clears
     │                          │                        │                     │     session
     │                          │                        │                     │     state
     │                          │                        │                     │
     │                          │                        │  8. Log event:      │
     │                          │                        │     LOGOUT          │
     │                          │                        │                     │
     │                          │  9. Clear cookies:     │                     │
     │                          │     hg-access-token    │                     │
     │                          │     hg-refresh-token   │                     │
     │                          │     hg-csrf            │                     │
     │                          │     hg-session-meta    │                     │
     │                          │     (Set-Cookie with   │                     │
     │                          │      Max-Age=0)        │                     │
     │                          │                        │                     │
     │  10. Set-Cookie (clear)  │                        │                     │
     │      + Redirect to       │                        │                     │
     │      /login              │                        │                     │
     │ ◄────────────────────────│                        │                     │
     │                          │                        │                     │
     │  11. Toast: \"You've      │                        │                     │
     │      been signed out.\"   │                        │                     │
     │                          │                        │                     │
     │  FAILURE PATH:           │                        │                     │
     │                          │                        │                     │
     │                          │  F1. Keycloak          │                     │
     │                          │      unreachable       │                     │
     │                          │                        │                     │
     │                          │  F2. Still clear ALL   │                     │
     │                          │      local cookies.    │                     │
     │                          │      FAIL CLOSED.      │                     │
     │                          │      Log error with    │                     │
     │                          │      correlation_id.   │                     │
     │                          │                        │                     │
     │  F3. Redirect to /login  │                        │                     │
     │      (user is logged     │                        │                     │
     │       out locally even   │                        │                     │
     │       if KC session      │                        │                     │
     │       persists)          │                        │                     │
     │ ◄────────────────────────│                        │                     │
```

### 5.e Password Reset Flow

```
 Browser                    Next.js BFF               Keycloak              SMTP
     │                          │                        │                     │
     │  1. GET /forgot-password │                        │                     │
     │ ────────────────────────►│                        │                     │
     │  2. Render form          │                        │                     │
     │ ◄────────────────────────│                        │                     │
     │                          │                        │                     │
     │  3. User enters email,   │                        │                     │
     │     clicks \"Send reset   │                        │                     │
     │     link\"                │                        │                     │
     │                          │                        │                     │
     │  4. POST /api/auth/      │                        │                     │
     │     forgot-password      │                        │                     │
     │     {email, csrf}        │                        │                     │
     │ ────────────────────────►│                        │                     │
     │                          │                        │                     │
     │                          │  5. Rate limit check:  │                     │
     │                          │     max 3 per email    │                     │
     │                          │     per 15 min         │                     │
     │                          │                        │                     │
     │                          │  6. PUT /admin/realms/ │                     │
     │                          │     {realm}/users/     │                     │
     │                          │     {id}/execute-      │                     │
     │                          │     actions-email      │                     │
     │                          │     [\"UPDATE_PASSWORD\"]│                     │
     │                          │     lifespan=900 (15m) │                     │
     │                          │ ──────────────────────►│                     │
     │                          │                        │                     │
     │                          │                        │  7. IF user exists: │
     │                          │                        │     Generate reset  │
     │                          │                        │     token (single-  │
     │                          │                        │     use, 15 min)    │
     │                          │                        │                     │
     │                          │                        │  8. Send email      │
     │                          │                        │ ───────────────────►│
     │                          │                        │  Subject: \"Reset    │
     │                          │                        │  your HealthGate    │
     │                          │                        │  password\"          │
     │                          │                        │                     │
     │                          │                        │  9. IF user does    │
     │                          │                        │     NOT exist:      │
     │                          │                        │     No email sent.  │
     │                          │                        │     No error.       │
     │                          │                        │                     │
     │  10. ALWAYS show:        │                        │                     │
     │  \"If an account exists   │                        │                     │
     │   with that email,       │                        │                     │
     │   you'll receive a       │                        │                     │
     │   password reset link    │                        │                     │
     │   shortly.\"              │                        │                     │
     │ ◄────────────────────────│                        │                     │
     │                          │                        │                     │
     │  ... User clicks link    │                        │                     │
     │  in email ...            │                        │                     │
     │                          │                        │                     │
     │  11. GET /reset-password │                        │                     │
     │      ?key={token}        │                        │                     │
     │ ────────────────────────►│                        │                     │
     │                          │                        │                     │
     │                          │  12. Validate token    │                     │
     │                          │      via Keycloak      │                     │
     │                          │ ──────────────────────►│                     │
     │                          │                        │                     │
     │  13. IF valid: render    │                        │                     │
     │      new password form   │                        │                     │
     │      IF expired/used:    │                        │                     │
     │      \"This reset link    │                        │                     │
     │      has expired...\"     │                        │                     │
     │ ◄────────────────────────│                        │                     │
     │                          │                        │                     │
     │  14. User enters new     │                        │                     │
     │      password + confirm  │                        │                     │
     │                          │                        │                     │
     │  15. POST /api/auth/     │                        │                     │
     │      reset-password      │                        │                     │
     │      {password, token,   │                        │                     │
     │       csrf}              │                        │                     │
     │ ────────────────────────►│                        │                     │
     │                          │                        │                     │
     │                          │  16. Update password   │                     │
     │                          │      via KC action     │                     │
     │                          │      token flow        │                     │
     │                          │ ──────────────────────►│                     │
     │                          │                        │                     │
     │                          │                        │  17. Validate pw    │
     │                          │                        │      policy (FR9)   │
     │                          │                        │  18. Hash + store   │
     │                          │                        │  19. Invalidate     │
     │                          │                        │      all sessions   │
     │                          │                        │  20. Revoke all     │
     │                          │                        │      trusted devs   │
     │                          │                        │  21. Log event:     │
     │                          │                        │      PASSWORD_RESET │
     │                          │                        │      _COMPLETE      │
     │                          │                        │                     │
     │  22. Redirect to /login  │                        │                     │
     │      Toast: \"Password    │                        │                     │
     │      updated. Please     │                        │                     │
     │      sign in with your   │                        │                     │
     │      new password.\"      │                        │                     │
     │ ◄────────────────────────│                        │                     │
```

### 5.f MFA Enrollment Flow

```
 Browser                    Next.js BFF               Keycloak
     │                          │                        │
     │  (After successful       │                        │
     │   credential check,      │                        │
     │   user has no MFA)       │                        │
     │                          │                        │
     │  1. Redirect to          │                        │
     │     /login/mfa-setup     │                        │
     │ ◄────────────────────────│                        │
     │                          │                        │
     │  2. GET /login/mfa-setup │                        │
     │ ────────────────────────►│                        │
     │                          │                        │
     │                          │  3. GET required       │
     │                          │     action:            │
     │                          │     CONFIGURE_TOTP     │
     │                          │ ──────────────────────►│
     │                          │                        │
     │                          │                        │  4. Generate TOTP
     │                          │                        │     secret:
     │                          │                        │     - 160-bit
     │                          │                        │       entropy
     │                          │                        │     - Base32
     │                          │                        │       encode
     │                          │                        │
     │                          │  5. Return TOTP        │
     │                          │     provisioning URI   │
     │                          │     + secret           │
     │                          │ ◄──────────────────────│
     │                          │                        │
     │  6. Render:              │                        │
     │     - QR code (200x200)  │                        │
     │       with otpauth://    │                        │
     │       totp/HealthGate:   │                        │
     │       {email}?secret=    │                        │
     │       {B32}&issuer=      │                        │
     │       HealthGate&algo=   │                        │
     │       SHA1&digits=6&     │                        │
     │       period=30          │                        │
     │     - Manual secret      │                        │
     │     - OTP input (6 dig)  │                        │
     │     Cache-Control:       │                        │
     │       no-store           │                        │
     │ ◄────────────────────────│                        │
     │                          │                        │
     │  7. User scans QR code   │                        │
     │     with authenticator   │                        │
     │     app                  │                        │
     │                          │                        │
     │  8. User enters 6-digit  │                        │
     │     verification code    │                        │
     │                          │                        │
     │  9. POST /api/auth/      │                        │
     │     mfa-setup            │                        │
     │     {totp_code, csrf}    │                        │
     │ ────────────────────────►│                        │
     │                          │                        │
     │                          │  10. POST required     │
     │                          │      action:           │
     │                          │      CONFIGURE_TOTP    │
     │                          │      {totp: code}      │
     │                          │ ──────────────────────►│
     │                          │                        │
     │                          │                        │  11. Validate TOTP
     │                          │                        │      against secret
     │                          │                        │
     │                          │                        │  12. IF valid:
     │                          │                        │      activate MFA
     │                          │                        │      credential
     │                          │                        │
     │                          │  13. Return success    │
     │                          │ ◄──────────────────────│
     │                          │                        │
     │                          │  14. Generate 5        │
     │                          │      recovery codes    │
     │                          │      (each 10 chars    │
     │                          │       alphanumeric     │
     │                          │       + dash: xxxxx-   │
     │                          │       xxxxx)           │
     │                          │                        │
     │                          │  15. Hash each code    │
     │                          │      (bcrypt, cost 12) │
     │                          │      and store hashes  │
     │                          │      in recovery_code  │
     │                          │      table             │
     │                          │                        │
     │  16. Render recovery     │                        │
     │      codes screen:       │                        │
     │      - 5 codes displayed │                        │
     │      - \"Copy\" button     │                        │
     │      - \"Download\" button │                        │
     │      - \"I've saved       │                        │
     │        these codes\"      │                        │
     │        checkbox          │                        │
     │      - \"Continue\" button │                        │
     │        (disabled until   │                        │
     │         checkbox checked)│                        │
     │ ◄────────────────────────│                        │
     │                          │                        │
     │  17. User confirms       │                        │
     │      checkbox + clicks   │                        │
     │      \"Continue\"          │                        │
     │                          │                        │
     │  18. Log event:          │                        │
     │      MFA_ENROLLED        │                        │
     │                          │                        │
     │  19. Complete auth flow  │                        │
     │      (issue tokens,      │                        │
     │       set cookies,       │                        │
     │       redirect to        │                        │
     │       dashboard)         │                        │
     │ ◄────────────────────────│                        │
```

---

## 6. Token Architecture

### 6.1 Access Token

| Property | Specification |
|---|---|
| Format | JWT (JWS) |
| Signing Algorithm | RS256 (RSA 2048-bit key) |
| Lifetime | 300 seconds (5 minutes) |
| Issuer (`iss`) | `https://auth.googlehealth.com/realms/{realm}` |
| Audience (`aud`) | `[\"{client_id}\", \"account\"]` |
| Type (`typ`) | `Bearer` |

**Claims:**

```json
{
  \"exp\": 1709312400,
  \"iat\": 1709312100,
  \"auth_time\": 1709312000,
  \"jti\": \"unique-token-id\",
  \"iss\": \"https://auth.googlehealth.com/realms/healthgate-clinician\",
  \"aud\": [\"clinical-decision-support\", \"account\"],
  \"sub\": \"550e8400-e29b-41d4-a716-446655440000\",
  \"typ\": \"Bearer\",
  \"azp\": \"clinical-decision-support\",
  \"session_state\": \"session-uuid\",
  \"acr\": \"1\",
  \"realm_access\": {
    \"roles\": [\"clinician\", \"default-roles-healthgate-clinician\"]
  },
  \"resource_access\": {
    \"clinical-decision-support\": {
      \"roles\": [\"cds-editor\", \"cds-viewer\"]
    },
    \"account\": {
      \"roles\": [\"manage-account\", \"view-profile\"]
    }
  },
  \"scope\": \"openid email profile\",
  \"sid\": \"session-uuid\",
  \"email_verified\": true,
  \"name\": \"Sarah Chen\",
  \"preferred_username\": \"sarah.chen@googlehealth.com\",
  \"given_name\": \"Sarah\",
  \"family_name\": \"Chen\",
  \"email\": \"sarah.chen@googlehealth.com\"
}
```

### 6.2 Refresh Token

| Property | Specification |
|---|---|
| Format | Opaque token (Keycloak internal, not JWT) |
| Lifetime (clinician realm) | 43200 seconds (12 hours) |
| Lifetime (patient realm) | 1800 seconds (30 minutes) |
| Rotation | Enabled. Each use issues a new refresh token and invalidates the previous. `maxReuse: 0` (single-use). |
| Storage | Encrypted in `hg-refresh-token` HttpOnly cookie. Server-side record in Keycloak's session store. |

**Rotation Policy:** When the refresh token is used to obtain a new access token, Keycloak issues a new refresh token and immediately invalidates the old one. If an attacker replays an old refresh token, Keycloak detects the reuse (since `maxReuse=0`) and terminates the entire session, logging a `TOKEN_REFRESH_FAILURE` event with `reason: token_reuse_detected`.

### 6.3 ID Token

| Property | Specification |
|---|---|
| Format | JWT (JWS) |
| Signing Algorithm | RS256 |
| Lifetime | Same as access token (300 seconds) |

**Claims:**

```json
{
  \"exp\": 1709312400,
  \"iat\": 1709312100,
  \"auth_time\": 1709312000,
  \"jti\": \"id-token-unique-id\",
  \"iss\": \"https://auth.googlehealth.com/realms/healthgate-clinician\",
  \"aud\": \"clinical-decision-support\",
  \"sub\": \"550e8400-e29b-41d4-a716-446655440000\",
  \"typ\": \"ID\",
  \"azp\": \"clinical-decision-support\",
  \"session_state\": \"session-uuid\",
  \"at_hash\": \"access-token-hash\",
  \"acr\": \"1\",
  \"sid\": \"session-uuid\",
  \"email_verified\": true,
  \"name\": \"Sarah Chen\",
  \"preferred_username\": \"sarah.chen@googlehealth.com\",
  \"given_name\": \"Sarah\",
  \"family_name\": \"Chen\",
  \"email\": \"sarah.chen@googlehealth.com\"
}
```

### 6.4 PKCE Flow

```
1. SDK generates code_verifier:
   - 43 random bytes, base64url-encoded (no padding)
   - Entropy: 256+ bits
   - Example: dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk

2. SDK computes code_challenge:
   - code_challenge = BASE64URL(SHA-256(code_verifier))
   - code_challenge_method = S256
   - Example: E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM

3. code_verifier stored in hg-pkce-verifier cookie
   (HttpOnly, Secure, SameSite=Strict, Max-Age=300)

4. Authorization request includes:
   code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM
   code_challenge_method=S256

5. Token exchange includes:
   code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk

6. Keycloak verifies:
   BASE64URL(SHA-256(code_verifier)) == stored code_challenge
```

---

## 7. Session Architecture

### 7.1 Server-Side Session Store (Keycloak)

Keycloak maintains the authoritative session state. Sessions are stored in two tiers:

| Tier | Storage | Purpose | Lifetime |
|---|---|---|---|
| Active sessions | Infinispan distributed cache | Fast lookup, session validation | While session is active |
| Persistent sessions | PostgreSQL `user_session` + `offline_user_session` tables | Survive cluster restarts | While session is active |

Infinispan cluster configuration (embedded in Keycloak):
```xml
<distributed-cache name=\"sessions\" owners=\"2\">
  <persistence passivation=\"false\">
    <jdbc-store xmlns=\"urn:infinispan:config:store:jdbc:15.0\"
                shared=\"true\"
                segmented=\"false\">
      <data-source jndi-name=\"java:jboss/datasources/KeycloakDS\"/>
      <string-keyed-table prefix=\"ISPN\" create-on-start=\"true\">
        <id-column name=\"ID\" type=\"VARCHAR(255)\"/>
        <data-column name=\"DATA\" type=\"BYTEA\"/>
        <timestamp-column name=\"TIMESTAMP\" type=\"BIGINT\"/>
        <segment-column name=\"SEGMENT\" type=\"INT\"/>
      </string-keyed-table>
    </jdbc-store>
  </persistence>
</distributed-cache>
```

With `owners=\"2\"`, each session is replicated to 2 nodes. If one node fails, the session survives on the other without any user impact. No sticky sessions are needed at the load balancer.

### 7.2 Client-Side Session (Next.js)

The Next.js BFF maintains no server-side session state. All session context is in encrypted HttpOnly cookies:

| Cookie | Contents | Purpose |
|---|---|---|
| `hg-access-token` | AES-256-GCM(JWT access token) | API authorization |
| `hg-refresh-token` | AES-256-GCM(JWT refresh token) | Silent token refresh |
| `hg-session-meta` | JSON: `{idleStartMs, maxStartMs, realmConfig}` | Client-side timer seed |
| `hg-csrf` | Random nonce | CSRF double-submit |

### 7.3 Idle Timeout Implementation

**Client-Side (React SDK `<SessionTimeoutWarning />`):**

```typescript
// Pseudocode for idle timeout logic
const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'touchstart', 'scroll'];
const WARNING_LEAD_MS = 2 * 60 * 1000; // 2 minutes before timeout

let lastActivityMs = Date.now();
let idleTimeoutMs: number; // from hg-session-meta cookie (default 15 * 60 * 1000)

// Debounced activity tracker (fires max once per second)
const onActivity = debounce(() => {
  lastActivityMs = Date.now();
  // BroadcastChannel: sync across tabs
  broadcastChannel.postMessage({ type: 'ACTIVITY', timestamp: lastActivityMs });
}, 1000);

// Register listeners
ACTIVITY_EVENTS.forEach(event => window.addEventListener(event, onActivity, { passive: true }));

// Check loop (runs every 10 seconds)
setInterval(() => {
  const elapsed = Date.now() - lastActivityMs;
  const remaining = idleTimeoutMs - elapsed;

  if (remaining <= 0) {
    // Timer expired -- force logout
    logout(); // POST /api/auth/logout
    redirect('/session-expired');
  } else if (remaining <= WARNING_LEAD_MS && !warningVisible) {
    showWarning(remaining); // AlertDialog with countdown
  }
}, 10_000);

// Warning countdown (runs every second when dialog is visible)
// \"Stay in\" -> POST /api/auth/refresh + reset lastActivityMs
// \"Sign out\" -> logout()
```

**Server-Side (Keycloak):**

Keycloak's `ssoSessionIdleTimeout` is set to match the client-side timer (900 seconds for 15 minutes). The client-side timer runs 5 seconds ahead to prevent the race condition (EC5). The server is always the authoritative validator -- if the server session has expired, the next API call or token refresh fails, and the client handles the 401/400 response gracefully.

### 7.4 Max Session Implementation

The max session lifetime is enforced by the Keycloak `ssoSessionMaxLifespan` setting and the refresh token lifetime. The refresh token's `exp` claim acts as the hard ceiling:

- Clinician realm: `ssoSessionMaxLifespan = 43200` (12 hours), refresh token lifetime = 43200
- Patient realm: `ssoSessionMaxLifespan = 1800` (30 minutes), refresh token lifetime = 1800

When the max lifetime is reached, the refresh token cannot be renewed regardless of activity. The SDK detects the 400 `invalid_grant` response and redirects to `/session-expired` with no extension option.

### 7.5 Concurrent Session Policy

| Realm | Default Max Concurrent | Eviction Policy |
|---|---|---|
| `healthgate-clinician` | Unlimited | N/A (clinicians use multiple devices) |
| `healthgate-patient` | 3 | FIFO (oldest session terminated) |

Configurable via Keycloak realm settings by admin (FR18). When eviction occurs:
- `event_type: SESSION_EVICTED`, `reason: MAX_CONCURRENT_EXCEEDED`
- The evicted session's next API call returns 401

### 7.6 Session Extension Mechanism

When the user clicks \"Stay in\" on the timeout warning:

1. SDK sends `POST /api/auth/refresh` to the Next.js BFF
2. BFF performs a token refresh with Keycloak (new access + refresh tokens)
3. This also resets Keycloak's server-side idle timer (`lastSessionRefresh` updated)
4. New tokens set in cookies, client-side idle timer reset
5. If the \"Stay in\" request fails (session already expired server-side): redirect to `/session-expired`

**Cross-Tab Synchronization:**

The SDK uses the `BroadcastChannel` API (`channel name: \"healthgate-session\"`) to synchronize across tabs:

| Message Type | Payload | Effect |
|---|---|---|
| `ACTIVITY` | `{timestamp}` | All tabs reset their idle timer |
| `WARNING` | `{remainingMs}` | All tabs show the warning dialog |
| `EXTEND` | `{newExpiry}` | All tabs dismiss the warning, reset timers |
| `LOGOUT` | `{}` | All tabs clear state, redirect to /login |
| `SESSION_EXPIRED` | `{}` | All tabs redirect to /session-expired |

Fallback for browsers without BroadcastChannel: `localStorage` event listener (`storage` event on key `healthgate-session-sync`).

---

## 8. API Contracts

### 8.1 OIDC Standard Endpoints (Keycloak)

All endpoints are prefixed with `https://auth.googlehealth.com/realms/{realm}/protocol/openid-connect/`.

| Endpoint | Method | Purpose | Key Parameters |
|---|---|---|---|
| `/auth` | GET | Authorization (redirect to login) | `response_type=code`, `client_id`, `redirect_uri`, `scope=openid email profile`, `state`, `code_challenge`, `code_challenge_method=S256` |
| `/token` | POST | Token exchange | `grant_type=authorization_code`, `code`, `redirect_uri`, `client_id`, `client_secret`, `code_verifier` |
| `/token` | POST | Token refresh | `grant_type=refresh_token`, `refresh_token`, `client_id`, `client_secret` |
| `/userinfo` | GET | User info | Authorization: Bearer {access_token} |
| `/logout` | GET | End session | `id_token_hint`, `post_logout_redirect_uri` |
| `/certs` | GET | JWKS (public keys) | N/A |
| `/token/introspect` | POST | Token introspection | `token`, `client_id`, `client_secret` |

Discovery document: `https://auth.googlehealth.com/realms/{realm}/.well-known/openid-configuration`

### 8.2 HealthGate Custom BFF Endpoints

Base URL: `https://app.googlehealth.com/api/auth/`

```typescript
// POST /api/auth/callback
// Purpose: OIDC authorization code callback handler
// Called by: Browser redirect from Keycloak
interface AuthCallbackRequest {
  code: string;             // Authorization code from Keycloak
  state: string;            // CSRF state parameter
}
// Response: Set-Cookie headers (hg-access-token, hg-refresh-token, etc.)
//           + 302 Redirect to original page or /dashboard

// POST /api/auth/refresh
// Purpose: Silent token refresh
// Called by: React SDK (automatic, when access token nears expiry)
interface AuthRefreshRequest {
  // No body -- refresh token is in hg-refresh-token cookie
}
interface AuthRefreshResponse {
  expiresAt: string;        // ISO 8601 timestamp of new access token expiry
  idleTimeoutMs: number;    // Realm-configured idle timeout in milliseconds
  maxLifetimeMs: number;    // Realm-configured max lifetime in milliseconds
}
// Also sets new cookies: hg-access-token, hg-refresh-token

// GET /api/auth/session
// Purpose: Get current session status
// Called by: React SDK (on mount, periodic health check)
interface SessionStatusResponse {
  authenticated: boolean;
  user: HealthGateUser | null;
  expiresAt: string | null;         // Access token expiry (ISO 8601)
  idleTimeoutMs: number | null;     // Configured idle timeout
  maxLifetimeMs: number | null;     // Configured max lifetime
  sessionStartedAt: string | null;  // ISO 8601
}

// POST /api/auth/logout
// Purpose: Terminate session
// Called by: React SDK (user action or timeout)
interface LogoutRequest {
  csrf_token: string;
}
// Response: Clear cookies + 302 Redirect to /login

// GET /api/auth/csrf
// Purpose: Get CSRF token for state-changing requests
interface CsrfResponse {
  token: string;            // 32-byte hex nonce
}

// POST /api/auth/login (BFF-mediated login)
// Purpose: Initiate OIDC flow with credentials
interface LoginRequest {
  email: string;
  password: string;
  csrf_token: string;
}
// Response: Redirect to /login/mfa (if MFA required) or set cookies + redirect

// POST /api/auth/mfa
// Purpose: Submit MFA code
interface MfaRequest {
  totp_code: string;        // 6-digit code
  remember_device?: boolean;
  csrf_token: string;
}

// POST /api/auth/mfa-setup
// Purpose: Verify and activate MFA
interface MfaSetupRequest {
  totp_code: string;
  csrf_token: string;
}
interface MfaSetupResponse {
  recovery_codes: string[];  // 5 codes, format: \"xxxxx-xxxxx\"
}

// POST /api/auth/forgot-password
interface ForgotPasswordRequest {
  email: string;
  csrf_token: string;
}
// Response: Always 200 with generic message

// POST /api/auth/reset-password
interface ResetPasswordRequest {
  password: string;
  confirm_password: string;
  token: string;             // Reset token from email link
  csrf_token: string;
}

// GET /api/admin/users (Admin Console)
interface UsersListRequest {
  search?: string;           // Name, email, or ID
  role?: string;
  status?: 'active' | 'locked' | 'disabled';
  mfa_status?: 'enrolled' | 'not_enrolled';
  page?: number;
  page_size?: number;        // Max 100
}
interface UsersListResponse {
  users: AdminUserView[];
  total: number;
  page: number;
  page_size: number;
}

// GET /api/admin/audit
interface AuditSearchRequest {
  user_id?: string;
  event_type?: string;
  client_id?: string;
  ip_address?: string;
  date_from: string;         // ISO 8601
  date_to: string;           // ISO 8601
  page?: number;
  page_size?: number;        // Max 1000
  format?: 'json' | 'csv';
}
interface AuditSearchResponse {
  events: AuditEvent[];
  total: number;
  page: number;
}

// POST /api/admin/users/{id}/terminate-sessions
// Purpose: Admin forced logout
interface TerminateSessionsRequest {
  reason?: string;           // Free text, optional
  csrf_token: string;
}

// GET /api/admin/reports/{report_type}
// report_type: access-audit | failed-auth | mfa-enrollment |
//              session-compliance | user-lifecycle | hipaa-control-mapping
interface ReportRequest {
  date_from: string;
  date_to: string;
  format: 'json' | 'csv' | 'pdf';
}
```

### 8.3 TypeScript Interfaces (SDK Public API)

```typescript
// @healthgate/react exported types

interface HealthGateUser {
  id: string;                          // Keycloak subject UUID
  email: string;
  name: string;
  givenName: string;
  familyName: string;
  emailVerified: boolean;
  roles: string[];                     // Combined realm + client roles
  realmRoles: string[];
  clientRoles: Record<string, string[]>;
  mfaEnabled: boolean;
  lastLogin: string;                   // ISO 8601
  sessionId: string;
}

interface HealthGateConfig {
  keycloakUrl: string;                 // e.g., \"https://auth.googlehealth.com\"
  realm: string;                       // e.g., \"healthgate-clinician\"
  clientId: string;                    // e.g., \"clinical-decision-support\"
  redirectUri?: string;                // Default: current origin + /api/auth/callback
  idleTimeoutMinutes?: number;         // Default: from realm config (15)
  sessionWarningMinutes?: number;      // Default: 2
  onSessionExpired?: () => void;       // Custom handler
  onAuthError?: (error: HealthGateError) => void;
  enableDeviceRemember?: boolean;      // Default: from realm config
}

interface HealthGateError {
  code: 'KEYCLOAK_UNREACHABLE' | 'TOKEN_EXPIRED' | 'INVALID_GRANT' |
        'NETWORK_ERROR' | 'CSRF_MISMATCH' | 'UNKNOWN';
  message: string;
  correlationId?: string;
}

interface AuthState {
  user: HealthGateUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: () => void;                   // Redirect to login
  logout: () => Promise<void>;         // POST /api/auth/logout
  token: string | null;                // Access token (for non-BFF API calls)
}

interface RolesState {
  roles: string[];
  hasRole: (roleName: string) => boolean;
  hasAnyRole: (roleNames: string[]) => boolean;
  hasAllRoles: (roleNames: string[]) => boolean;
}

interface SessionState {
  expiresAt: Date | null;
  idleTimeRemaining: number;           // Milliseconds
  maxTimeRemaining: number;            // Milliseconds
  extendSession: () => Promise<void>;  // Token refresh + timer reset
  isSessionWarningVisible: boolean;
}
```

---

## 9. Deployment Architecture

### 9.1 Docker Compose (Development)

```yaml
# docker-compose.yml (development)
version: \"3.9\"

services:
  keycloak:
    image: quay.io/keycloak/keycloak:24.0.5
    command: start-dev --import-realm
    environment:
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://postgres:5432/keycloak
      KC_DB_USERNAME: keycloak
      KC_DB_PASSWORD: ${KC_DB_PASSWORD}   # From .env (not committed)
      KC_HOSTNAME: localhost
      KC_HOSTNAME_PORT: 8080
      KC_HTTP_ENABLED: \"true\"
      KC_HEALTH_ENABLED: \"true\"
      KC_METRICS_ENABLED: \"true\"
      KC_FEATURES: \"preview\"
      KEYCLOAK_ADMIN: admin
      KEYCLOAK_ADMIN_PASSWORD: ${KC_ADMIN_PASSWORD}
    volumes:
      - ./keycloak/realms:/opt/keycloak/data/import
      - ./keycloak/themes/healthgate:/opt/keycloak/themes/healthgate
      - ./keycloak/providers:/opt/keycloak/providers  # Custom event listener JAR
    ports:
      - \"8080:8080\"
    networks:
      - hg-auth-net
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: [\"CMD-SHELL\", \"exec 3<>/dev/tcp/localhost/9000 && echo -e 'GET /health/ready HTTP/1.1\\r\
Host: localhost\\r\
\\r\
' >&3 && cat <&3 | grep -q '\\\"status\\\":\\\"UP\\\"'\"]
      interval: 10s
      timeout: 5s
      retries: 10
    deploy:
      resources:
        limits:
          cpus: \"2.0\"
          memory: 2G

  postgres:
    image: postgres:16.2-alpine
    environment:
      POSTGRES_DB: keycloak
      POSTGRES_USER: keycloak
      POSTGRES_PASSWORD: ${KC_DB_PASSWORD}
    volumes:
      - pg-data:/var/lib/postgresql/data
      - ./postgres/init:/docker-entrypoint-initdb.d  # Custom tables (trusted_device, etc.)
    ports:
      - \"5432:5432\"
    networks:
      - hg-auth-net
    healthcheck:
      test: [\"CMD-SHELL\", \"pg_isready -U keycloak -d keycloak\"]
      interval: 5s
      timeout: 3s
      retries: 5
    deploy:
      resources:
        limits:
          cpus: \"1.0\"
          memory: 1G

  nextjs:
    build:
      context: .
      dockerfile: Dockerfile
      target: development
    environment:
      KEYCLOAK_URL: http://keycloak:8080
      KEYCLOAK_REALM: healthgate-clinician
      KEYCLOAK_CLIENT_ID: healthgate-dev
      KEYCLOAK_CLIENT_SECRET: ${KC_CLIENT_SECRET}
      NEXTAUTH_URL: http://localhost:3000
      COOKIE_ENCRYPTION_KEY: ${COOKIE_ENCRYPTION_KEY}  # 32 bytes hex
      NODE_ENV: development
    ports:
      - \"3000:3000\"
    networks:
      - hg-auth-net
      - hg-bridge
    depends_on:
      keycloak:
        condition: service_healthy
    volumes:
      - ./src:/app/src         # Hot reload
      - ./public:/app/public

  kafka:
    image: bitnami/kafka:3.7
    environment:
      KAFKA_CFG_NODE_ID: 1
      KAFKA_CFG_PROCESS_ROLES: controller,broker
      KAFKA_CFG_CONTROLLER_QUORUM_VOTERS: 1@kafka:9093
      KAFKA_CFG_LISTENERS: PLAINTEXT://:9092,CONTROLLER://:9093
      KAFKA_CFG_AUTO_CREATE_TOPICS_ENABLE: \"true\"
    ports:
      - \"9092:9092\"
    networks:
      - hg-auth-net
    deploy:
      resources:
        limits:
          cpus: \"0.5\"
          memory: 512M

  # Dev-only mock gateway (production uses Envoy)
  gateway-mock:
    build:
      context: ./gateway
      dockerfile: Dockerfile.dev
    environment:
      JWKS_URL: http://keycloak:8080/realms/healthgate-clinician/protocol/openid-connect/certs
      UPSTREAM_URL: http://mock-app:9443
    ports:
      - \"8443:8443\"
    networks:
      - hg-bridge
      - hg-gateway-net

  # Dev-only mock downstream app
  mock-app:
    image: nginx:alpine
    networks:
      - hg-gateway-net
      - hg-phi-net

networks:
  hg-auth-net:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.0.0/16
  hg-gateway-net:
    driver: bridge
    ipam:
      config:
        - subnet: 172.21.0.0/16
  hg-phi-net:
    driver: bridge
    internal: true          # No internet access
    ipam:
      config:
        - subnet: 172.22.0.0/16
  hg-bridge:
    driver: bridge
    ipam:
      config:
        - subnet: 172.23.0.0/16

volumes:
  pg-data:
```

### 9.2 Kubernetes (Production)

**Namespace: `healthgate-auth` (Zone 1)**

```yaml
# Keycloak Deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: keycloak
  namespace: healthgate-auth
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: keycloak
  template:
    metadata:
      labels:
        app: keycloak
      annotations:
        prometheus.io/scrape: \"true\"
        prometheus.io/port: \"9000\"
        prometheus.io/path: \"/metrics\"
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        fsGroup: 1000
      containers:
        - name: keycloak
          image: quay.io/keycloak/keycloak:24.0.5
          args:
            - start
            - --optimized
            - --cache=ispn
            - --cache-stack=kubernetes
          env:
            - name: KC_DB
              value: postgres
            - name: KC_DB_URL
              valueFrom:
                secretKeyRef:
                  name: keycloak-db
                  key: url
            - name: KC_DB_USERNAME
              valueFrom:
                secretKeyRef:
                  name: keycloak-db
                  key: username
            - name: KC_DB_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: keycloak-db
                  key: password
            - name: KC_HOSTNAME
              value: auth.googlehealth.com
            - name: KC_PROXY
              value: edge
            - name: KC_HEALTH_ENABLED
              value: \"true\"
            - name: KC_METRICS_ENABLED
              value: \"true\"
            - name: KC_CACHE_CONFIG_FILE
              value: cache-ispn-kubernetes.xml
            - name: JAVA_OPTS_KC_HEAP
              value: \"-XX:MaxRAMPercentage=70.0\"
            - name: jgroups.dns.query
              value: keycloak-headless.healthgate-auth.svc.cluster.local
          ports:
            - name: http
              containerPort: 8080
            - name: management
              containerPort: 9000
            - name: jgroups
              containerPort: 7800
          resources:
            requests:
              cpu: 500m
              memory: 1Gi
            limits:
              cpu: 2000m
              memory: 2Gi
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 9000
            initialDelaySeconds: 30
            periodSeconds: 10
            failureThreshold: 3
          livenessProbe:
            httpGet:
              path: /health/live
              port: 9000
            initialDelaySeconds: 60
            periodSeconds: 30
            failureThreshold: 5
          startupProbe:
            httpGet:
              path: /health/started
              port: 9000
            initialDelaySeconds: 15
            periodSeconds: 5
            failureThreshold: 30
          volumeMounts:
            - name: keycloak-tls
              mountPath: /opt/keycloak/conf/tls
              readOnly: true
      volumes:
        - name: keycloak-tls
          secret:
            secretName: keycloak-tls-cert

---
# Keycloak Headless Service (for Infinispan/JGroups discovery)
apiVersion: v1
kind: Service
metadata:
  name: keycloak-headless
  namespace: healthgate-auth
spec:
  clusterIP: None
  selector:
    app: keycloak
  ports:
    - name: jgroups
      port: 7800
      targetPort: 7800

---
# Keycloak ClusterIP Service
apiVersion: v1
kind: Service
metadata:
  name: keycloak
  namespace: healthgate-auth
spec:
  type: ClusterIP
  selector:
    app: keycloak
  ports:
    - name: http
      port: 8080
      targetPort: 8080
    - name: management
      port: 9000
      targetPort: 9000

---
# HPA for Keycloak
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: keycloak-hpa
  namespace: healthgate-auth
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: keycloak
  minReplicas: 3
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
```

**Network Policy (Zone 1 isolation):**

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: zone1-auth-policy
  namespace: healthgate-auth
spec:
  podSelector: {}
  policyTypes:
    - Ingress
    - Egress
  ingress:
    # Allow from gateway namespace
    - from:
        - namespaceSelector:
            matchLabels:
              zone: gateway
      ports:
        - protocol: TCP
          port: 8080
    # Allow from ingress controller namespace
    - from:
        - namespaceSelector:
            matchLabels:
              name: ingress-nginx
      ports:
        - protocol: TCP
          port: 8080
        - protocol: TCP
          port: 3000
    # Allow intra-namespace (Keycloak to PG, Keycloak to Kafka, etc.)
    - from:
        - podSelector: {}
  egress:
    # Allow intra-namespace
    - to:
        - podSelector: {}
    # Allow DNS
    - to:
        - namespaceSelector: {}
      ports:
        - protocol: UDP
          port: 53
    # Allow SMTP (external)
    - to:
        - ipBlock:
            cidr: 0.0.0.0/0
      ports:
        - protocol: TCP
          port: 465
    # Allow external SAML IdPs
    - to:
        - ipBlock:
            cidr: 0.0.0.0/0
      ports:
        - protocol: TCP
          port: 443
    # DENY access to healthgate-phi namespace
    - to:
        - namespaceSelector:
            matchLabels:
              zone: phi
      # This rule intentionally has no ports, making it a deny-all to PHI zone
```

### 9.3 Environment Configurations

| Setting | Development | Staging | Production |
|---|---|---|---|
| Keycloak replicas | 1 | 2 | 3 (min) -- 10 (max) |
| PostgreSQL | Single instance, no HA | Primary + async standby | Primary + sync standby + async read replica |
| PgBouncer | Not used | Enabled, 100 max conn | Enabled, 200 max conn |
| Next.js replicas | 1 | 2 | 3 (min) -- 50 (max) |
| TLS | Self-signed (dev CA) | Let's Encrypt staging | Let's Encrypt production |
| Secrets | `.env` file (gitignored) | K8s Secrets (sealed-secrets) | Vault (AppRole auth) |
| Audit logging | Console output (JSON) | ELK (7-day retention) | ELK (6 yr 210 day retention) |
| Domain | `localhost` | `staging-auth.googlehealth.com` | `auth.googlehealth.com` |
| Debug logging | Enabled | Enabled | Disabled (INFO level only) |
| OTEL sampling | 100% | 100% | 10% |
| CDN | Not used | Cloudflare (staging) | Cloudflare (production) |

### 9.4 Secrets Management

**Development:** `.env` file (gitignored, template in `.env.example`):
```
KC_DB_PASSWORD=dev-password-only
KC_ADMIN_PASSWORD=admin
KC_CLIENT_SECRET=dev-secret-only
COOKIE_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
```

**Staging:** Sealed Secrets (Bitnami) encrypted with the cluster's public key. Committed to git as `SealedSecret` resources. Decrypted only inside the cluster.

**Production:** HashiCorp Vault with Kubernetes auth method:
- Path: `secret/healthgate/prod/*`
- Policies: `healthgate-keycloak` (read DB creds, signing keys), `healthgate-nextjs` (read client secret, cookie key), `healthgate-kafka` (read SASL creds)
- Dynamic database credentials: Vault generates short-lived PostgreSQL credentials (24-hour TTL, auto-rotated)
- Transit engine for Keycloak signing keys: keys never leave Vault; signing operations happen via API

---

## 10. Scalability Design

### 10.1 Keycloak Clustering

| Component | Configuration | Purpose |
|---|---|---|
| **Infinispan** | Distributed cache, `owners=2`, TCP_PING (dev) / DNS_PING (K8s) | Session replication across pods |
| **JGroups** | Stack: `kubernetes` (uses `jgroups.dns.query` for pod discovery via headless service) | Cluster membership and communication |
| **JDBC Persistence** | Enabled for all caches (passivation=false) | Session survival across full cluster restarts |
| **Cache Tuning** | `sessions`: max-count=50000 per node, eviction=LIRS; `authenticationSessions`: max-count=10000, lifespan=300s | Memory management |

**Scaling Triggers:**
- Add replica when: avg CPU > 70% for 3 minutes OR avg request latency p95 > 1 second for 3 minutes
- Remove replica when: avg CPU < 30% for 10 minutes AND avg request latency p95 < 200ms
- Minimum 3 replicas (quorum requirement for Infinispan distributed cache integrity)
- Scale-down rate: max 1 pod per 5 minutes (graceful session migration)

### 10.2 PostgreSQL Read Replicas

| Role | Purpose | Consumers |
|---|---|---|
| Primary | All writes, real-time reads | Keycloak (via PgBouncer) |
| Synchronous Standby | HA failover (zero data loss) | Promoted on primary failure (Patroni) |
| Async Read Replica | Reporting and admin queries | Admin Console (audit log search, user search), Compliance reports |

**PgBouncer Configuration (production):**

```ini
[databases]
keycloak = host=pg-primary port=5432 dbname=keycloak

[pgbouncer]
listen_port = 6432
listen_addr = 0.0.0.0
auth_type = scram-sha-256
pool_mode = transaction
default_pool_size = 25
max_client_conn = 400
max_db_connections = 200
min_pool_size = 10
reserve_pool_size = 5
reserve_pool_timeout = 3
server_idle_timeout = 600
server_lifetime = 3600
query_timeout = 30
client_idle_timeout = 300
log_connections = 1
log_disconnections = 1
stats_period = 60
```

### 10.3 CDN for Static Assets

**Provider:** Cloudflare (or Google Cloud CDN).

**Cache Rules:**

| Path Pattern | Cache-Control | TTL | Purge Strategy |
|---|---|---|---|
| `/_next/static/*` | `public, max-age=31536000, immutable` | 1 year | Content-hash in filename (auto-busted) |
| `/fonts/*` | `public, max-age=31536000` | 1 year | Manual purge on font update |
| `/images/*` | `public, max-age"}],"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":1,"cache_creation_input_tokens":11790,"cache_read_input_tokens":56127,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":11790},"output_tokens":1,"service_tier":"standard","inference_geo":"not_available"}},"requestId":"req_011CYciu1autcorz2PJoKA2J","type":"assistant","uuid":"aeba5aa0-ef44-499a-86fe-0c6054a6c8fb","timestamp":"2026-03-01T17:12:36.970Z"}
{"parentUuid":"aeba5aa0-ef44-499a-86fe-0c6054a6c8fb","isSidechain":true,"userType":"external","cwd":"/Users/avn/Desktop/prodACA","sessionId":"9c67f529-7085-4a27-8d6a-0170e858e022","version":"2.1.63","gitBranch":"HEAD","agentId":"a1a6422f4f3b11bc6","slug":"crystalline-percolating-gadget","type":"assistant","uuid":"85f18fe8-7eac-4800-a4a6-19ca4330f41b","timestamp":"2026-03-01T17:12:37.079Z","message":{"id":"f5ec9111-1b41-4c22-9bd8-ae25a1bba173","container":null,"model":"<synthetic>","role":"assistant","stop_reason":"stop_sequence","stop_sequence":"","type":"message","usage":{"input_tokens":0,"output_tokens":0,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"server_tool_use":{"web_search_requests":0,"web_fetch_requests":0},"service_tier":null,"cache_creation":{"ephemeral_1h_input_tokens":0,"ephemeral_5m_input_tokens":0},"inference_geo":null,"iterations":null,"speed":null},"content":[{"type":"text","text":"API Error: Claude's response exceeded the 32000 output token maximum. To configure this behavior, set the CLAUDE_CODE_MAX_OUTPUT_TOKENS environment variable."}],"context_management":null},"apiError":"max_output_tokens","error":"max_output_tokens","isApiErrorMessage":true}
{"parentUuid":"85f18fe8-7eac-4800-a4a6-19ca4330f41b","isSidechain":true,"userType":"external","cwd":"/Users/avn/Desktop/prodACA","sessionId":"9c67f529-7085-4a27-8d6a-0170e858e022","version":"2.1.63","gitBranch":"HEAD","agentId":"a1a6422f4f3b11bc6","slug":"crystalline-percolating-gadget","message":{"model":"claude-opus-4-6","id":"msg_01UsPJjrY1a46M8xHwt1wPLm","type":"message","role":"assistant","content":[{"type":"text","text":"

Continuing from Section 10.3 (CDN for Static Assets) where the response was cut off.

---

## 10. Scalability Design (Continued)

### 10.3 CDN for Static Assets (Continued)

| Path Pattern | Cache-Control | TTL | Purge Strategy |
|---|---|---|---|
| `/_next/static/*` | `public, max-age=31536000, immutable` | 1 year | Content-hash in filename (auto-busted) |
| `/fonts/*` | `public, max-age=31536000` | 1 year | Manual purge on font update |
| `/images/*` | `public, max-age=86400` | 24 hours | Manual purge |
| `/login`, `/register`, etc. | `no-store, no-cache, must-revalidate` | Never cached | N/A (always origin) |
| `/api/*` | `no-store` | Never cached | N/A |

CDN configuration includes:
- WAF rules: OWASP CRS ruleset, rate limiting at edge (100 req/s per IP before reaching origin)
- DDoS protection: Layer 3/4 auto-mitigation
- Bot management: Challenge suspicious automated traffic on auth endpoints
- Geographic restriction: Configurable per deployment (e.g., US-only for initial launch)

### 10.4 Horizontal Pod Autoscaling Rules

| Component | Min Replicas | Max Replicas | Scale-Up Trigger | Scale-Down Trigger | Cooldown |
|---|---|---|---|---|---|
| Keycloak | 3 | 10 | CPU avg > 70% for 3 min OR memory avg > 80% for 3 min | CPU avg < 30% for 10 min | Up: 60s, Down: 300s |
| Next.js BFF | 3 | 50 | CPU avg > 70% for 2 min | CPU avg < 20% for 10 min | Up: 30s, Down: 300s |
| API Gateway (Envoy) | 2 | 20 | CPU avg > 60% for 2 min | CPU avg < 20% for 10 min | Up: 30s, Down: 300s |
| PgBouncer | 2 | 4 | Connection saturation > 80% | Connection saturation < 30% | Up: 60s, Down: 600s |

### 10.5 Connection Pooling (PgBouncer)

Detailed configuration was provided in Section 10.2. Key capacity math:

```
Keycloak pods (max 10) x connections per pod (20) = 200 max DB connections
PgBouncer max_db_connections = 200
PostgreSQL max_connections = 250 (headroom for admin, replication, monitoring)

At 50K concurrent sessions:
  - Estimated 500 logins/second peak
  - Each login = ~3 DB queries (credential lookup, session create, event write)
  - 1,500 queries/second
  - With transaction pooling: each query holds a connection for ~2ms
  - Concurrent connections needed: 1,500 * 0.002 = ~3 connections
  - PgBouncer handles this easily with default_pool_size=25
```

---

## 11. Observability

### 11.1 Metrics (Prometheus / Grafana)

**Keycloak Metrics** (exposed at `:9000/metrics`):

| Metric Name | Type | Labels | Alert Threshold |
|---|---|---|---|
| `keycloak_logins_total` | Counter | `realm`, `client_id`, `result` (success/error) | Error rate > 10% for 5 min |
| `keycloak_login_duration_seconds` | Histogram | `realm`, `client_id` | p95 > 2s for 5 min |
| `keycloak_active_sessions` | Gauge | `realm` | > 45,000 (90% of 50K capacity) |
| `keycloak_failed_login_attempts_total` | Counter | `realm`, `error` | > 100/min (brute force pattern) |
| `keycloak_token_refreshes_total` | Counter | `realm`, `result` | Failure rate > 5% for 5 min |
| `keycloak_mfa_challenges_total` | Counter | `realm`, `method`, `result` | Failure rate > 20% for 5 min |
| `keycloak_account_lockouts_total` | Counter | `realm` | > 50/hour |
| `keycloak_registrations_total` | Counter | `realm` | Anomaly detection |

**Next.js BFF Metrics** (custom Prometheus client):

| Metric Name | Type | Labels | Alert Threshold |
|---|---|---|---|
| `healthgate_bff_request_duration_seconds` | Histogram | `route`, `method`, `status_code` | p95 > 500ms for 5 min |
| `healthgate_bff_token_refresh_duration_seconds` | Histogram | `realm`, `result` | p95 > 200ms for 5 min |
| `healthgate_bff_csrf_validation_failures_total` | Counter | `route` | > 10/min |
| `healthgate_bff_cookie_encryption_errors_total` | Counter | `operation` (encrypt/decrypt) | Any > 0 |

**Infrastructure Metrics** (standard Kubernetes metrics):

| Metric | Source | Alert Threshold |
|---|---|---|
| CPU utilization | kube-state-metrics | > 85% sustained 5 min |
| Memory utilization | kube-state-metrics | > 90% sustained 5 min |
| Pod restart count | kube-state-metrics | > 3 in 10 min |
| PgBouncer active connections | pgbouncer_exporter | > 160 of 200 max |
| PgBouncer waiting clients | pgbouncer_exporter | > 0 sustained 1 min |
| PostgreSQL replication lag | postgres_exporter | > 1 second |
| PostgreSQL connection count | postgres_exporter | > 200 of 250 max |
| Disk usage | node_exporter | > 80% |
| Certificate expiry | cert-manager metrics | < 14 days |

### 11.2 Logging (Structured JSON, ELK Pipeline)

**Log Format (all services):**

```json
{
  \"timestamp\": \"2026-03-01T14:30:00.000Z\",
  \"level\": \"INFO\",
  \"service\": \"healthgate-bff\",
  \"environment\": \"production\",
  \"correlation_id\": \"req-uuid-1234567890\",
  \"trace_id\": \"otel-trace-id\",
  \"span_id\": \"otel-span-id\",
  \"message\": \"Token refresh completed\",
  \"duration_ms\": 45,
  \"user_id\": \"550e8400...\",
  \"realm\": \"healthgate-clinician\",
  \"client_id\": \"clinical-decision-support\",
  \"http_method\": \"POST\",
  \"http_path\": \"/api/auth/refresh\",
  \"http_status\": 200,
  \"remote_ip\": \"10.0.1.42\"
}
```

**Log Levels by Environment:**

| Level | Development | Staging | Production |
|---|---|---|---|
| DEBUG | Enabled | Enabled | Disabled |
| INFO | Enabled | Enabled | Enabled |
| WARN | Enabled | Enabled | Enabled |
| ERROR | Enabled | Enabled | Enabled |

**ELK Pipeline:**

```
Keycloak (Quarkus JSON logging) ──┐
                                   ├──► Kafka topic: hg-app-logs ──► Logstash ──► Elasticsearch
Next.js BFF (pino JSON logger) ───┘     (3 partitions, RF=3)        (parse,       (index: healthgate-
                                                                      enrich,       logs-YYYY.MM.DD)
Keycloak Event Listener SPI ──────────► Kafka topic: hg-audit-events  GeoIP)  ──► Elasticsearch
                                         (3 partitions, RF=3)                      (index: healthgate-
                                                                                    audit-YYYY.MM)
```

**Sensitive Data Redaction:** Logstash filters strip any field matching patterns: `password`, `secret`, `token`, `credential`, `code_verifier`, `totp`, `recovery_code`. Fields are replaced with `[REDACTED]`.

**Retention:**
- Application logs (`healthgate-logs-*`): 90 days hot, then delete
- Audit logs (`healthgate-audit-*`): 6 years 210 days (ILM policy per Section 3.e)

### 11.3 Tracing (OpenTelemetry)

**Instrumentation:**

| Service | SDK | Auto-Instrumentation |
|---|---|---|
| Next.js BFF | `@opentelemetry/sdk-node` | HTTP, fetch, pg (database), next.js |
| Keycloak | OpenTelemetry Java Agent (JAVAAGENT) | HTTP server, JDBC, Infinispan |
| Envoy Gateway | Built-in OTEL support | HTTP proxy spans |
| PgBouncer | Not instrumented (transparent proxy) | N/A |

**Configuration:**

```
OTEL_SERVICE_NAME=healthgate-bff (or healthgate-keycloak, healthgate-gateway)
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector.healthgate-observability:4317
OTEL_TRACES_SAMPLER=parentbased_traceidratio
OTEL_TRACES_SAMPLER_ARG=0.1  (production: 10% sampling)
OTEL_RESOURCE_ATTRIBUTES=service.namespace=healthgate,deployment.environment=production
```

**Trace propagation:** `traceparent` header (W3C Trace Context) propagated across all services. The `correlation_id` in application logs maps to the OTEL `trace_id` for cross-referencing.

**Trace backend:** Tempo (Grafana) or Jaeger, queried via Grafana Explore.

### 11.4 Alerting Rules (SLO-Based)

**SLO Definition:**

| SLO | Target | Error Budget (30 days) | Measurement |
|---|---|---|---|
| Availability | 99.95% | 21.6 minutes | Synthetic login probe, every 30 seconds |
| Login latency (p95) | < 2 seconds | 5% of requests may exceed | Prometheus histogram |
| Token refresh latency (p95) | < 200ms | 5% of requests may exceed | Prometheus histogram |

**Alert Rules (Prometheus/Alertmanager):**

```yaml
# Critical (PagerDuty page on-call)
- alert: HealthGateLoginFailureRateHigh
  expr: |
    rate(keycloak_logins_total{result=\"error\"}[5m])
    / rate(keycloak_logins_total[5m]) > 0.10
  for: 5m
  labels:
    severity: critical
  annotations:
    summary: \"Login failure rate exceeds 10% for 5 minutes\"

- alert: HealthGateKeycloakDown
  expr: up{job=\"keycloak\"} == 0
  for: 1m
  labels:
    severity: critical
  annotations:
    summary: \"Keycloak replica unreachable\"

- alert: HealthGateDBFailover
  expr: pg_replication_is_replica{job=\"postgres-primary\"} == 1
  for: 0m
  labels:
    severity: critical
  annotations:
    summary: \"PostgreSQL failover detected -- primary is now a replica\"

- alert: HealthGateZeroLogins
  expr: rate(keycloak_logins_total{result=\"success\"}[2m]) == 0
  for: 2m
  labels:
    severity: critical
  annotations:
    summary: \"Zero successful logins for 2 minutes\"

# Warning (Slack notification)
- alert: HealthGateElevatedLockouts
  expr: rate(keycloak_account_lockouts_total[1h]) > 50
  for: 0m
  labels:
    severity: warning
  annotations:
    summary: \"Elevated account lockout rate (>50/hour) -- possible brute force\"

- alert: HealthGateCertExpiringSoon
  expr: certmanager_certificate_expiration_timestamp_seconds - time() < 2592000
  for: 0m
  labels:
    severity: warning
  annotations:
    summary: \"TLS certificate expires in less than 30 days\"

- alert: HealthGateDiskUsageHigh
  expr: node_filesystem_avail_bytes / node_filesystem_size_bytes < 0.20
  for: 10m
  labels:
    severity: warning
  annotations:
    summary: \"Disk usage exceeds 80%\"

- alert: HealthGateReplicationLag
  expr: pg_replication_lag_seconds > 1
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: \"PostgreSQL replication lag exceeds 1 second\"

- alert: HealthGateErrorBudgetBurn
  expr: |
    1 - (
      sum(rate(healthgate_bff_request_duration_seconds_count{status_code!~\"5..\"}[1h]))
      / sum(rate(healthgate_bff_request_duration_seconds_count[1h]))
    ) > 0.001
  for: 1h
  labels:
    severity: warning
  annotations:
    summary: \"Error budget burn rate exceeds 1x -- on track to exhaust monthly budget\"
```

### 11.5 Dashboard Specifications

**Dashboard 1: Auth Overview**
- Login rate (success/failure) over time (line chart, 5-min granularity)
- Login latency percentiles (p50, p95, p99) over time
- Active sessions by realm (gauge + time series)
- Token refresh rate and failure rate
- Current error budget consumption (percentage bar)

**Dashboard 2: Session Management**
- Active sessions by realm and client (stacked bar)
- Session timeout events (idle vs. max) over time
- Session extensions (\"Stay in\" clicks) over time
- Concurrent session distribution (histogram)

**Dashboard 3: Security**
- Account lockouts over time, by IP and realm
- Failed MFA attempts over time
- Top 10 IPs by failed login attempts (table)
- New device login notifications sent
- Brute-force protection activations

**Dashboard 4: Infrastructure**
- Keycloak pod CPU and memory (per pod)
- PostgreSQL connections (active, idle, waiting)
- PgBouncer pool utilization
- Kafka consumer lag (audit events)
- Elasticsearch index size and ingestion rate

---

## 12. Disaster Recovery

### 12.1 Backup Strategy

**PostgreSQL:**

| Backup Type | Frequency | Retention | Storage | Encryption |
|---|---|---|---|---|
| Full base backup (pg_basebackup) | Every 6 hours | 30 days | GCS/S3 (separate region) | AES-256-GCM (server-side) |
| WAL archiving (continuous) | Continuous (every completed WAL segment, ~16MB) | 7 days | GCS/S3 (same bucket, separate prefix) | AES-256-GCM |
| Logical backup (pg_dump) | Daily | 90 days | GCS/S3 (separate region) | AES-256-GCM |

**Point-in-time recovery (PITR):** Using base backup + WAL replay, recovery to any point within the last 7 days with granularity of individual transactions (RPO approaches zero for recent data).

**Keycloak Configuration:**
- Realm configuration exported as JSON (`/admin/realms/{realm}`) and committed to git (version-controlled)
- Custom themes and providers stored in git
- Terraform state for infrastructure stored in encrypted remote backend (GCS with versioning)

**Elasticsearch:**
- Searchable snapshots to GCS/S3 for cold-tier indices
- Snapshot lifecycle management: daily snapshots, retained for duration matching ILM policy
- Audit log indices are the most critical -- covered by the hash chain integrity mechanism (Section 3.e)

**Vault:**
- Vault auto-unseal with Cloud KMS
- Vault integrated storage (Raft) with snapshot schedule: every 1 hour, retained 7 days
- Disaster recovery replication to secondary Vault cluster (if available)

### 12.2 RTO/RPO Targets

| Component | RTO | RPO | Mechanism |
|---|---|---|---|
| Keycloak cluster | 15 seconds (single pod failure) | 0 (Infinispan replication) | Kubernetes pod restart + liveness probe |
| Keycloak cluster (full) | 5 minutes | 0 (JDBC persistence) | New pods start, load sessions from DB |
| PostgreSQL (primary failure) | 15 seconds | 0 (synchronous standby) | Patroni automatic failover |
| PostgreSQL (data center loss) | 30 minutes | < 1 minute (WAL shipping) | Promote async replica in secondary AZ |
| PostgreSQL (data corruption) | 1 hour | Depends on PITR target | Restore base backup + WAL replay |
| Elasticsearch (node failure) | Automatic (replica shards) | 0 | Shard rebalancing |
| Elasticsearch (cluster loss) | 4 hours | Last snapshot (max 24 hours) | Restore from GCS/S3 snapshots |
| Full Zone 1 (catastrophic) | 2 hours | < 1 minute (WAL) | Restore from backups in secondary region |

### 12.3 Failover Procedures

**PostgreSQL Automatic Failover (Patroni):**

```
1. Patroni health check detects primary failure (5-second interval, 3 missed checks)
2. Patroni promotes synchronous standby to primary (automatic, ~10 seconds)
3. PgBouncer reconfigures to point to new primary (via Patroni REST API callback)
4. Keycloak JDBC connections reconnect via PgBouncer (transparent, ~2-5 seconds)
5. Async read replica reconfigures to replicate from new primary
6. Alert fires: \"Warning: PostgreSQL failover triggered\"
7. SRE investigates failed node, either recovers or provisions replacement
8. Recovered/new node joins as new standby
```

**Keycloak Pod Failure:**

```
1. Kubernetes liveness probe fails (3 consecutive failures at 30-second intervals)
2. Kubernetes restarts the pod
3. During restart (~30 seconds):
   - Remaining pods handle all traffic (Infinispan has session copies)
   - Load balancer stops routing to unhealthy pod
   - No user impact for existing sessions
   - New logins may experience ~2 second increased latency
4. Pod becomes ready (readiness probe passes)
5. Load balancer resumes routing
6. Infinispan rebalances session ownership
```

**Full Keycloak Cluster Recovery:**

```
1. All pods are down (e.g., bad deployment, node pool failure)
2. Kubernetes attempts restart based on deployment spec
3. First pod starts, loads session data from PostgreSQL (JDBC persistence)
4. Subsequent pods start, join Infinispan cluster
5. Session data rehydrated from DB (may take 1-2 minutes for 50K sessions)
6. During recovery:
   - Gateway (Zone 2) continues validating existing access tokens via cached JWKS
   - Users with valid access tokens (< 5 min old) experience no interruption
   - Token refresh fails -- SDK retries 3x with exponential backoff
   - New logins fail -- users see \"We're experiencing a temporary issue\"
7. Full recovery when at least 1 pod passes readiness probe
```

### 12.4 Runbook Outline

| Runbook ID | Title | Trigger | Key Steps |
|---|---|---|---|
| RB-001 | Keycloak Pod Failure | Alert: HealthGateKeycloakDown | Check pod events, node status, resource limits. Verify Infinispan rebalancing. Monitor login success rate. |
| RB-002 | PostgreSQL Failover | Alert: HealthGateDBFailover | Verify Patroni promotion. Check replication lag on new standby. Verify PgBouncer routing. Investigate root cause of original failure. |
| RB-003 | Full Auth Outage | Alert: HealthGateZeroLogins for > 5 min | Triage: check all pods, DB, network policies, DNS, TLS certs. Execute rollback if caused by deployment. Page SRE lead if unresolved in 10 min. |
| RB-004 | Token Signing Key Compromise | Security team notification | Emergency key rotation via Vault (< 5 min). Invalidate all sessions. Force re-authentication for all users. Notify app teams. Post-incident review. |
| RB-005 | Brute Force Attack | Alert: HealthGateElevatedLockouts | Identify attacking IPs. Add to WAF blocklist if confirmed. Verify Keycloak brute-force protection is functioning. Check affected accounts. Notify security team. |
| RB-006 | Elasticsearch Cluster Failure | Alert: Elasticsearch cluster health RED | Audit logging degrades to Kafka buffering. Kafka retains events for up to 7 days. Fix ES cluster. Logstash replays from Kafka on recovery. No audit data loss. |
| RB-007 | Certificate Expiry | Alert: HealthGateCertExpiringSoon | Check cert-manager logs. Force renewal: `kubectl cert-manager renew`. Verify new cert deployed. |
| RB-008 | Database Restore (PITR) | Data corruption detected | Stop Keycloak writes. Identify corruption timestamp. Restore from nearest base backup. Replay WAL to target timestamp. Verify data integrity. Restart Keycloak. |
| RB-009 | Emergency Rollback | Failed deployment causing errors | `kubectl rollout undo deployment/keycloak -n healthgate-auth`. Verify rollback. Monitor error rate. Post-mortem required. |
| RB-010 | Vault Unsealing | Vault sealed after restart | Auto-unseal via Cloud KMS should handle automatically. If manual unseal needed: retrieve unseal keys from secure storage, unseal via CLI. Verify all services can read secrets. |

---

## 13. Alternatives Considered

### 13.1 Why Keycloak over Ory / Authentik

| Criterion | Keycloak | Ory (Hydra + Kratos + Keto) | Authentik | Decision Factor |
|---|---|---|---|---|
| SAML 2.0 | Full support | Limited (no native SP/IdP) | Full support | **Disqualifying for Ory.** Hospital SAML federation (FR4) is a P0 requirement. Epic, Cerner, and athenahealth all use SAML. Without full SAML, HealthGate cannot federate with hospital identity systems. |
| Production maturity | 10+ years, Red Hat backed | 5+ years, growing | 3+ years, community | Keycloak is the most battle-tested open-source IdP. Healthcare organizations (including Japanese pharma with 2M+ users) run it in production. The risk tolerance for a HIPAA-regulated platform does not allow for a less-proven system. |
| Healthcare precedent | Documented in FHIR backends globally | Healthcare-adjacent only | Emerging in SMB healthcare | Existing healthcare deployments reduce compliance risk. Auditors are more comfortable with known-quantity systems. |
| RBAC/AuthZ | Full RBAC + ABAC via authorization services | Google Zanzibar model (Keto) -- more expressive but more complex | Limited | Keycloak's realm roles + client roles directly map to HealthGate's RBAC model (FR13). Ory's Zanzibar model is more powerful but adds significant complexity for RBAC-only use cases. |
| Operational complexity | High (JVM, 1-2GB RAM per instance) | High (4 separate Go microservices) | Medium (Python, PostgreSQL + Redis) | Keycloak is a single deployment unit. Ory requires orchestrating 4 services. For a platform team managing HealthGate alongside other responsibilities, the single-binary model is preferable. |
| Admin console | Built-in, full-featured | None (API-only, build your own) | Built-in, visual flow editor | Keycloak's admin console provides immediate value for James Park (Admin persona) without custom development. Ory requires building an admin UI from scratch. |

**Decision:** Keycloak. The SAML 2.0 gap in Ory is disqualifying for healthcare. Keycloak's maturity and healthcare track record align with the risk profile of a HIPAA-regulated platform. Authentik is promising but too young for this risk level.

### 13.2 Why Next.js BFF over SPA-Only

| Approach | Security Model | Token Storage | PHI Exposure Risk |
|---|---|---|---|
| **SPA-only (rejected)** | Public OIDC client. Tokens in browser memory or localStorage. | localStorage or sessionStorage. JavaScript-accessible. | XSS attack can steal tokens. Tokens in browser are vulnerable to extension injection, supply chain attacks on npm packages, and developer error. |
| **Next.js BFF (chosen)** | Confidential OIDC client. Tokens never reach browser JavaScript. | HttpOnly, Secure, SameSite=Strict cookies. Encrypted (AES-256-GCM). Not accessible to JavaScript. | XSS cannot steal tokens. Cookie-based transport is immune to JavaScript-based exfiltration. Client secret stays server-side. |

**Additional BFF benefits:**
- Server-side rendering of auth pages (better SEO, progressive enhancement, faster initial load)
- Security headers applied at the server layer (CSP, HSTS cannot be bypassed by client code)
- CSRF protection via double-submit cookie pattern (server validates)
- Error message sanitization (raw Keycloak errors never reach browser)
- Centralized logging and tracing (server-side, not dependent on client telemetry)

**Decision:** BFF pattern. For HIPAA-regulated applications, the additional security of HttpOnly cookie token storage and the confidential client model justify the marginal increase in infrastructure complexity. The CISO (Dr. Robert Kim) specifically requires that tokens never be JavaScript-accessible.

### 13.3 Why Server-Side Sessions over Client-Side JWTs

| Approach | Session Revocation | Token Size | Scalability | Security |
|---|---|---|---|---|
| **Client-side JWTs only (rejected)** | Cannot revoke until expiry. Must wait for short-lived token to expire. Requires token blacklist for immediate revocation (negates the stateless benefit). | Large (1-2KB with claims). Cookie size limits may apply. | Stateless -- easy horizontal scaling. | If JWT is stolen, valid until expiry. No server-side control. |
| **Server-side sessions in Keycloak + short-lived JWT access tokens (chosen)** | Immediate revocation via Keycloak Admin API. Session termination propagates within 30 seconds. Refresh token invalidation prevents new access tokens. | Access token: ~1KB. Short-lived (5 min). | Infinispan distributed cache provides horizontal scaling with session replication. | Stolen access token valid for max 5 minutes. Refresh token is single-use with rotation. Server has full control. |

**Decision:** Hybrid model. Short-lived JWTs (5 min) for stateless API authorization at the Gateway (Zone 2), combined with server-side sessions in Keycloak for revocation, forced logout (FR8), and session policy enforcement (FR7). This gives the scalability benefits of JWTs for API calls while maintaining the security guarantees of server-side session control required by HIPAA 164.312(a)(2)(iii) (automatic logoff) and FR8 (admin-initiated termination).

### 13.4 Why 3-Zone over 2-Zone

| Model | Architecture | Blast Radius | Complexity |
|---|---|---|---|
| **2-Zone (rejected)** | Auth + API Gateway in one zone, PHI in another. | Auth compromise gives attacker access to API Gateway, which has direct routes to PHI backends. Lateral movement from auth to PHI is possible within the shared zone. | Lower (fewer network policies, fewer services). |
| **3-Zone (chosen)** | Auth isolated in Zone 1. Gateway in Zone 2 (validates tokens, enforces RBAC, no persistent state). PHI in Zone 3 (no inbound from Zone 1). | Auth compromise in Zone 1 gives attacker zero access to PHI. Zone 1 cannot reach Zone 3 -- network policies enforce this. Attacker must also compromise Zone 2 (which is stateless and has no credentials) to reach Zone 3. | Higher (three network namespaces, more network policies, cross-zone mTLS). |

**Key argument for 3-Zone:** The auth database contains user credentials and session tokens. If compromised, an attacker has authenticated identities. In a 2-Zone model, those identities can be used to traverse the shared zone to PHI backends. In the 3-Zone model, Zone 1 is network-isolated from Zone 3. The Gateway (Zone 2) is stateless -- it validates JWT signatures using cached public keys and forwards requests. It stores no credentials, no sessions, and no tokens. An attacker who compromises Zone 1 has credentials but no network path to Zone 3. An attacker who compromises Zone 2 has no credentials and no persistent state.

**Decision:** 3-Zone. The incremental operational complexity (one additional Kubernetes namespace, additional network policies) is trivial compared to the security guarantee: **auth compromise cannot reach PHI**. This is the single most important architectural decision in HealthGate and the primary differentiator cited in the Product Brief.

---

## 14. Open Questions

| # | Question | Impact | Proposed Resolution | Decision Owner | Deadline |
|---|---|---|---|---|---|
| OQ1 | Should patient and clinician identities be in separate Keycloak realms or a single realm with role-based policy differentiation? Separate realms provide stronger isolation (different password policies, session timeouts, MFA policies) but complicate SSO if a user is both a clinician and a patient. A single realm simplifies user management but requires per-role policy configuration (which Keycloak supports via client policies). | Architecture: affects realm configuration, token claims, SDK configuration, admin console | Recommend **separate realms** (`healthgate-clinician`, `healthgate-patient`) for V1. Stronger isolation aligns with HIPAA principle of minimum necessary access. Cross-realm SSO is not required (clinicians do not use patient portals with the same identity). | CISO + Privacy Counsel | Before Sprint 1 |
| OQ2 | What is the compliance timeline pressure from the 2025 HIPAA Security Rule finalization? The rule has a 180-day compliance window. Does this create a hard deadline for HealthGate? | Timeline: may compress schedule | Confirm with Privacy Counsel whether the 180-day window applies to HealthGate specifically or to the organization broadly. If the latter, HealthGate's launch may need to precede the deadline to give app teams time to integrate. | Privacy Counsel | Before Sprint 1 |
| OQ3 | Should HealthGate support hospital LDAP/AD direct federation in V1, or is SAML 2.0 federation sufficient? LDAP requires Keycloak User Federation configuration and potentially exposes HealthGate to LDAP injection risks. SAML federation achieves the same SSO goal without direct directory access. | Scope: LDAP adds complexity and attack surface | Recommend **SAML-only for V1**. All major hospital IdPs (AD FS, Okta, Ping) support SAML. Direct LDAP federation can be added in Phase 2 if specific hospital partnerships require it. | CISO + IT Admin Lead | Before Sprint 2 |
| OQ4 | Do any existing applications have contractual authentication requirements (customer-mandated IdP, specific MFA method, specific session timeout) that would conflict with HealthGate's centralized policies? | Scope: may require per-client policy exceptions in Keycloak | Survey all 6 app team leads. Document any contractual constraints. Keycloak supports per-client overrides for most policies, so conflicts are likely resolvable without architectural changes. | Legal + App Team Leads | Before Sprint 1 |
| OQ5 | What SMTP relay should HealthGate use for transactional email (password reset, new device notifications)? Options: Google Workspace SMTP relay, SendGrid, Amazon SES, dedicated SMTP server. | Operations: affects email deliverability, SPF/DKIM configuration | Recommend **SendGrid** or **Amazon SES** with dedicated IP, SPF, DKIM, and DMARC configured for `noreply@auth.googlehealth.com`. Avoid Google Workspace relay due to sending limits. | IT Operations | Before Sprint 3 |
| OQ6 | Is SMS-based MFA acceptable for the patient realm? The CISO has concerns about SIM-swap attacks. However, Maria Rodriguez (patient persona) finds authenticator apps confusing. | UX vs. Security tradeoff | Recommend **deferring SMS MFA** for V1. Provide excellent onboarding UX for TOTP (jargon-free instructions, naming specific apps). Revisit for Phase 2 if patient MFA enrollment rates are low (< 80%). WebAuthn as an alternative may be more accessible for patients with modern devices. | CISO | Before Sprint 4 |
| OQ7 | Should Keycloak password hashing use bcrypt (Keycloak default) or Argon2id? The PRD mentions Argon2 but Keycloak's built-in credential hashing uses bcrypt. Argon2id is considered superior (memory-hard, resistant to GPU attacks) but requires a custom Keycloak credential provider SPI. | Security: affects password storage strength. Engineering: custom SPI development effort. | Recommend **bcrypt with cost factor 12 for V1** (Keycloak built-in, zero custom code). Develop and deploy Argon2id SPI for V2 (post-launch). Bcrypt with cost 12 exceeds HIPAA requirements. The marginal security improvement of Argon2id does not justify the custom development risk for V1 launch. | Security Lead + Engineering Lead | Before Sprint 2 |
| OQ8 | What is the strategy for migrating existing users from the 6 legacy auth systems? Should HealthGate support importing bcrypt/scrypt/PBKDF2 hashed passwords to avoid forcing password resets? | Migration: affects user experience and adoption timeline | Keycloak supports credential import via Admin API with `credentialData` containing the hash. For bcrypt passwords, direct import is possible (Keycloak uses bcrypt natively). For other hash formats, a custom credential provider SPI may be needed. Recommend a per-app migration playbook. | Engineering Lead + App Team Leads | Before Sprint 4 |
| OQ9 | Should the audit log hash chain (tamper evidence) be implemented as a Keycloak SPI or as a Logstash filter? SPI approach: hash chain computed at event creation time (strongest guarantee). Logstash approach: hash chain computed during ingestion (simpler implementation but a window exists where events in Kafka are not yet chained). | Security: tamper evidence strength. Engineering: implementation complexity. | Recommend **Keycloak SPI** for hash chain computation. The event is chained before it leaves Keycloak, eliminating the Kafka transport gap. The Logstash pipeline independently verifies the chain on ingestion. | Security Lead | Before Sprint 3 |
| OQ10 | What is the disaster recovery posture for a full region loss? The current architecture targets a single region. Should V1 include warm standby in a secondary region, or is cross-region replication sufficient? | Reliability: affects RTO for catastrophic failure | Recommend **single-region with cross-region backups for V1**. Full RTO for region loss: 2 hours (restore from backups). Multi-region active-active or warm standby deferred to Phase 2. The 99.95% SLA can be met with single-region HA (3 AZs). | SRE Lead + Director of Engineering | Before Sprint 1 |

---

### Critical Files for Implementation

Based on this comprehensive architecture analysis, the following files from the existing repository are most critical for beginning implementation:

- `/Users/avn/Desktop/prodACA/docs/phase1-prd/06-prd.md` - The authoritative source for all 25 functional requirements and 12 non-functional requirements. Every component, flow, and configuration in this architecture document traces directly to FRs and NFRs specified in this PRD. Implementation must validate against this document's acceptance criteria.

- `/Users/avn/Desktop/prodACA/docs/phase0-discovery/05-ux-ui-design-spec.md` - Contains the complete UI specification including all 10 screens, shadcn/ui component inventory, design tokens (OKLCH color system), interaction states, error message patterns, accessibility requirements, and responsive breakpoints. This directly drives the Next.js BFF frontend implementation (Section 3.c) and the React SDK components (FR16).

- `/Users/avn/Desktop/prodACA/docs/phase0-discovery/01-product-brief.md` - Establishes the foundational architectural constraint (3-Zone isolation model), the tech stack decisions (Keycloak 24+, Next.js 14, PostgreSQL 16), and the measurable success criteria (KR1-KR6) that gate launch readiness. All deployment, scaling, and observability decisions in this architecture document are derived from these constraints.

- `/Users/avn/Desktop/prodACA/docs/phase0-discovery/03-competitive-analysis.md` - Contains the Keycloak selection rationale and the IdP decision matrix (Section 3.5) that justifies the \"Alternatives Considered\" section of this architecture document. Also documents the SAML 2.0 hard requirement for hospital federation, which directly drives the Keycloak realm configuration and SSO flow design.

- `/Users/avn/Desktop/prodACA/docs/phase0-discovery/02-user-personas.md` - Contains the 5 detailed personas whose needs directly shaped the session architecture (Dr. Sarah Chen's 70+ logins/shift drives SSO and session extension), the MFA flow design (Maria Rodriguez's confusion drives jargon-free UX), and the admin console requirements (James Park's 20% time on manual provisioning drives SCIM and centralized management). Every architectural tradeoff in this document references these personas."}],"stop_reason":"end_turn","stop_sequence":null,"usage":{"input_tokens":3,"cache_creation_input_tokens":32032,"cache_read_input_tokens":67917,"output_tokens":9560,"server_tool_use":{"web_search_requests":0,"web_fetch_requests":0},"service_tier":"standard","cache_creation":{"ephemeral_1h_input_tokens":32032,"ephemeral_5m_input_tokens":0},"inference_geo":"","iterations":[],"speed":"standard"}},"requestId":"req_011CYcjXJVA5JLLT4uuFrWfu","type":"assistant","uuid":"5a5d34bb-ca0f-445b-aa1a-f472e12941d7","timestamp":"2026-03-01T17:16:06.191Z"}
