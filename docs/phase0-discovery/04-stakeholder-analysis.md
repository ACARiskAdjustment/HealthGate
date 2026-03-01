# HealthGate — Stakeholder Analysis & Pain Points

---

## 1. Stakeholder Map

```
                        HIGH INFLUENCE
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              │   CISO       │   VP Eng     │
              │   (Blocker)  │   (Sponsor)  │
              │              │              │
              │   Privacy    │   App Team   │
              │   Counsel    │   Leads      │
              │   (Blocker)  │   (Champions)│
 LOW INTEREST ├──────────────┼──────────────┤ HIGH INTEREST
              │              │              │
              │   Legal      │   App Devs   │
              │   (Informed) │   (Users)    │
              │              │              │
              │   Exec       │   Clinicians │
              │   Leadership │   (End Users)│
              │   (Informed) │              │
              └──────────────┼──────────────┘
                             │
                        LOW INFLUENCE
```

---

## 2. Stakeholder Interviews — Key Findings

### Stakeholder: App Team Leads (x5 teams surveyed)

**Pain Points Reported:**
1. "We spent **6 weeks building auth** for our last app. That's 6 weeks we didn't spend on clinical features."
2. "Every team asks the same questions — session timeout length, password policy, MFA method — and every team answers differently."
3. "When a new HIPAA requirement drops, each team has to independently figure out what to change in their auth code."
4. "We have no shared auth infrastructure. If Team A finds and fixes an auth vulnerability, Teams B through F still have it."
5. "Onboarding a new app to production requires a separate security review for auth every time."

**What They Want:**
- Auth as a service — call an API, get authenticated users
- React components that match their existing design systems
- Local development setup that doesn't require a security engineering degree
- HIPAA compliance "for free" — sensible defaults they don't have to research

---

### Stakeholder: CISO / Security Team

**Pain Points Reported:**
1. "I have to security-review 6 different auth implementations. They all have different vulnerability profiles."
2. "When we do penetration testing, the same auth weaknesses show up in multiple apps — different codebases, same mistakes."
3. "I cannot produce a unified 'who accessed what, when' report across the portfolio. Every audit, we manually correlate logs from 6 systems."
4. "The 2025 HIPAA rule makes MFA explicitly mandatory. I have to verify each app enforces it. With 6 implementations, that's 6 verification efforts."
5. "If one app's auth is compromised, I have no confidence it doesn't cascade to PHI in other apps."

**What They Want:**
- One system to audit, penetration test, and monitor
- Centralized audit trail with tamper-evident storage
- Architectural guarantee that auth compromise doesn't reach PHI
- HIPAA compliance dashboard — real-time, not annual
- Fail-closed behavior — deny on error, never grant on error

---

### Stakeholder: Privacy Counsel

**Pain Points Reported:**
1. "Each app team comes to me separately asking 'Is our auth HIPAA compliant?' I give the same guidance 6 times."
2. "BAA language needs to cover auth-related data processing. Currently it's app-by-app."
3. "Password reset flows must not expose PHI in error messages. I've found this violation in 2 of our apps."
4. "We need to demonstrate 'reasonable and appropriate' safeguards under §164.306. Inconsistency across apps weakens this argument."

**What They Want:**
- Standardized auth that they review once
- Clear documentation of what data the auth system stores (none should be PHI)
- Verified error message templates that never leak PHI
- One BAA amendment instead of six

---

### Stakeholder: Clinicians (via UX research interviews, n=12)

**Pain Points Reported:**
1. "I log into one app, then open another app and have to log in again. Why don't they know I'm already authenticated?"
2. "I got logged out in the middle of entering a patient note. When I logged back in, my draft was gone."
3. "The MFA setup was confusing. I had to download an app I'd never heard of."
4. "In the ED, I don't have time to type a 16-character password. I need to get to the patient's records NOW."
5. "My colleague uses my login sometimes when hers isn't working. I know we're not supposed to, but the patient needs care."

**What They Want:**
- Single sign-on — log in once for the shift, access all apps
- Session warnings before timeout, with one-click extension
- MFA that works without a phone (badge tap, fingerprint)
- Break-glass emergency access when normal auth fails
- Credential sharing problem solved by making login fast enough that it's never needed

---

## 3. Consolidated Pain Point → Solution Mapping

| # | Pain Point | Frequency | Severity | HealthGate Solution |
|---|---|---|---|---|
| 1 | Redundant auth implementation across apps | All 5 teams | High | Centralized auth service + React SDK |
| 2 | Inconsistent HIPAA compliance | CISO, Privacy, 4/5 teams | Critical | HIPAA-hardened Keycloak defaults, one review |
| 3 | No unified audit trail | CISO, Privacy | Critical | Centralized Keycloak event logging |
| 4 | Clinician login friction / re-auth fatigue | 12/12 clinicians | High | SSO across apps, session extension |
| 5 | Same auth vulnerabilities across apps | CISO, 3/5 teams | Critical | Single codebase — fix once, fix everywhere |
| 6 | Auth compromise could reach PHI | CISO | Critical | 3-Zone architectural isolation |
| 7 | PHI leakage in error messages | Privacy, 2/5 teams | High | Standardized generic error templates |
| 8 | 6-week auth buildout per new app | All 5 teams | High | < 1 day integration via SDK |
| 9 | MFA is impractical in clinical settings | 8/12 clinicians | Medium | WebAuthn + future badge-tap support |
| 10 | Credential sharing workarounds | 3/12 clinicians | High | Fast login eliminates the incentive to share |

---

## 4. Decision: Proceed to PRD

**Recommendation:** The discovery phase confirms strong demand from all stakeholder groups. The core value proposition — **centralized, isolated, HIPAA-compliant auth that integrates in under a day** — addresses pain points rated Critical or High by every stakeholder category.

**Key risks to address in PRD:**
- Keycloak operational complexity (needs dedicated platform engineering)
- Migration path for existing apps with custom auth
- Hospital LDAP/AD federation (open question from Product Brief)
- Clinician workflow interruption during migration

**Next Step:** Phase 1 — Product Requirements Document
