# HealthGate — Product Brief (1-Pager)

**Product Name:** HealthGate
**Tagline:** One secure front door for every Google Health application.
**Author:** [PM Name] | **Date:** 2026-02-28 | **Status:** DRAFT

---

## Problem

Google Health operates 6+ web-based healthcare applications, each building its own authentication system independently. This creates:

1. **Redundant engineering effort** — Every team re-implements login, MFA, session management, password policies, and audit logging from scratch
2. **Inconsistent HIPAA compliance posture** — Each app interprets §164.312 controls differently; no unified security baseline
3. **No unified audit trail** — Security teams cannot answer "who accessed what, when" across the product suite without querying 6+ separate systems
4. **Clinician frustration** — Different credentials per app, inconsistent session behavior, no SSO across the portfolio
5. **Regulatory risk** — The 2025 HIPAA Security Rule update (first major update in 20 years) makes MFA and encryption explicitly mandatory; fragmented implementations increase audit surface

## Industry Context

- Clinicians average **70+ logins per 12-hour shift** and lose **122 hours/year** to login friction (Imprivata research)
- **85% of healthcare IT leaders** say passwordless auth is critical, but only **7%** have implemented it
- **54% of healthcare orgs** use 3+ authentication vendors — creating fragmented policy enforcement
- No major EHR vendor (Epic, Cerner, athenahealth) has solved the clinician auth friction problem
- The 2025 HIPAA NPRM eliminates "addressable" ambiguity — MFA, encryption, and audit logging become explicit requirements with 180-day compliance window

## Opportunity

Build a **single, reusable authentication platform** that any Google Health web application can integrate in under one day. This platform:

- Eliminates redundant auth implementations across the portfolio
- Guarantees HIPAA Security Rule compliance out-of-the-box
- Creates a unified audit trail across all applications
- Enables SSO across the Google Health product suite
- Reduces clinician login friction through modern auth (TOTP, WebAuthn, future passwordless)
- Reduces regulatory audit burden with centralized compliance controls

## Proposed Solution

**HealthGate** — A HIPAA-compliant, plug-and-play authentication service built on open-source technology (Keycloak + Next.js + PostgreSQL), deployed as isolated Docker containers, and distributed as:

1. A **hosted auth service** (Keycloak instance with HIPAA-hardened configuration)
2. A **React component library** (`<HealthGateLogin />`, `<SessionProvider />`, `useAuth()`) for instant frontend integration
3. A **Claude-like login UI** — clean, calm, trustworthy — consistent across all Health apps
4. **Centralized audit logging** — every auth event across every app, in one place

## Architecture Principle

**3-Zone Isolation Model:** The authentication system (Zone 1) is architecturally isolated from PHI data (Zone 3). If an attacker compromises the login layer, they gain zero access to protected health information. Auth DB contains zero PHI, ever.

## Success Metrics (OKRs)

**Objective:** Become the default authentication system for all Google Health web applications

| Key Result | Target | Timeline |
|---|---|---|
| KR1: Apps integrated | 3+ apps | 6 months post-launch |
| KR2: HIPAA audit findings (auth-related) | Zero | Ongoing |
| KR3: Mean integration time for new app | < 8 hours | Post-SDK release |
| KR4: Auth-related support tickets | 60% reduction | 6 months post-launch |
| KR5: Login latency (p95) | < 200ms | At launch |
| KR6: Auth system uptime | 99.95% | At launch |

## Target Users

| Persona | Needs |
|---|---|
| **Clinician** | Fast, friction-free login; SSO across Health apps; works on shared workstations |
| **Patient** | Simple, trustworthy login; password reset that works; MFA that isn't confusing |
| **Admin** | Centralized user/policy management; org-wide MFA enforcement; access reports |
| **Developer** | Drop-in React components; < 1 day integration; clear docs; HIPAA compliance "for free" |
| **Security Auditor** | Unified audit trail; compliance reports; incident investigation tools |

## Open Questions

1. Should HealthGate support federated identity with hospital AD/LDAP systems?
2. Should patient identity and clinician identity be separate realms or unified?
3. What is the timeline pressure from the 2025 HIPAA rule finalization?
4. Do any existing apps have contractual auth requirements that would conflict?

## Tech Stack (Open Source)

| Component | Technology |
|---|---|
| Identity Provider | Keycloak 24+ |
| Frontend | Next.js 14 (React, App Router) |
| Database | PostgreSQL 16 |
| Styling | Tailwind CSS |
| Containers | Docker + Docker Compose (dev), Kubernetes (prod) |
| MFA | TOTP + WebAuthn (Keycloak built-in) |
| Audit | Structured JSON logs (ELK-ready) |
