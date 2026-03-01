# HealthGate — User Personas

---

## Persona 1: Dr. Sarah Chen — Clinician (Primary User)

**Role:** Emergency Medicine Physician, Level 1 Trauma Center
**Age:** 38 | **Tech Comfort:** High (uses Epic daily, iPhone, wearables)

### Context
- Works 12-hour shifts in a fast-paced ED
- Uses 3 Google Health apps daily: clinical decision support, patient messaging, lab results viewer
- Accesses apps from shared workstations (nursing stations, trauma bays, on-call rooms)
- Currently maintains separate credentials for each app
- Logs in 70+ times per shift due to session timeouts and app switching

### Goals
- Log in once, access all Health apps seamlessly (SSO)
- Never be locked out mid-patient-encounter
- Authentication should take < 5 seconds, not disrupt clinical workflow
- MFA that doesn't require pulling out phone during trauma resuscitation

### Frustrations
- "I spend more time logging in than reading results"
- Session timeouts during active charting force full re-authentication
- Password complexity requirements differ across apps — can't remember which password goes where
- MFA via SMS is unreliable in basement trauma bays with poor cell signal

### HIPAA Implications
- Shared workstations require aggressive auto-logoff (§164.312(a))
- Break-glass access needed for emergency scenarios
- Every login event must be attributable to her specifically — no shared accounts (§164.312(a)(2)(i))

### Success Looks Like
- Badge tap or biometric login at shared workstations
- SSO token valid across all Health apps for her shift
- Session warning 2 minutes before timeout, with 1-click extension
- MFA via hardware key or biometric, not SMS

---

## Persona 2: Maria Rodriguez — Patient (End User)

**Role:** Type 2 Diabetes patient managing chronic condition
**Age:** 62 | **Tech Comfort:** Moderate (uses smartphone, email, online banking)

### Context
- Uses a Google Health patient portal to view lab results, message her doctor, and manage prescriptions
- Logs in 2-3 times per week from her personal iPhone and home laptop
- Has accounts at 3 different health systems — each with separate patient portals
- Her adult daughter helps her navigate technology

### Goals
- Simple login that "just works" — similar to her banking app
- Easy password reset when she forgets (happens ~monthly)
- Understand why MFA is needed without being intimidated
- Trust that her health information is safe

### Frustrations
- "Why do I need another password? I already have too many"
- Previous MFA setup was confusing — she didn't understand "authenticator app"
- Password reset emails sometimes go to spam
- Got locked out once and had to call the help desk; wait was 45 minutes

### HIPAA Implications
- Her PHI (lab results, diagnoses, medications) must never be visible on the login page or in error messages
- Account recovery must verify identity without exposing PHI (§164.312(d))
- She should receive notification when her account is accessed from a new device

### Success Looks Like
- Login experience as simple as her banking app
- SMS-based MFA (she understands text messages)
- Clear, jargon-free instructions for setup
- "Remember this device" option for her personal devices
- Big, clear error messages that tell her what to do next

---

## Persona 3: James Park — IT Administrator (Admin User)

**Role:** Healthcare IT Security Administrator
**Age:** 45 | **Tech Comfort:** Expert (CISSP, 15+ years in healthcare IT)

### Context
- Manages user access for 2,000+ clinicians and staff across the organization
- Responsible for HIPAA compliance audits and incident response
- Currently manages separate user directories for each Health app
- Spends 20% of his time on user provisioning/deprovisioning — manually

### Goals
- Single admin console to manage users, roles, and policies across all Health apps
- Automated user provisioning and deprovisioning (SCIM)
- One-click compliance reports for HIPAA audits
- Real-time alerts for suspicious authentication activity
- Enforce organization-wide MFA policy from one place

### Frustrations
- "When someone leaves the organization, I have to disable their account in 6 different systems"
- No unified view of who accessed what across the app portfolio
- Each app has different password policies — auditors flag this every year
- Investigating a security incident requires pulling logs from multiple systems and correlating timestamps manually

### HIPAA Implications
- Must be able to demonstrate access controls to auditors (§164.312(a))
- Audit logs must be tamper-evident and retained for 6+ years (§164.312(b))
- User termination must propagate across all apps within 24 hours
- Must produce compliance reports on demand for OCR investigations

### Success Looks Like
- Centralized admin console with user lifecycle management
- SCIM-based auto-provisioning from HR system
- Dashboard showing: active sessions, failed logins, locked accounts, MFA enrollment status
- Exportable audit logs in standard format (CEF/JSON)
- Pre-built HIPAA compliance report template

---

## Persona 4: Priya Patel — Software Developer (Integrator)

**Role:** Full-Stack Developer on Google Health's Clinical Decision Support team
**Age:** 29 | **Tech Comfort:** Expert (React, Node.js, TypeScript, Docker)

### Context
- Building a new clinical decision support tool using React/Next.js
- Has been told to "add authentication" to her app before launch
- Last time, her team spent 6 weeks building custom auth — login, MFA, session management, audit logging, password reset
- Wants to focus on clinical features, not re-building login screens

### Goals
- Drop-in auth solution that works in under a day
- React components that match the app's design system
- Clear documentation with working code examples
- Confidence that auth is "HIPAA compliant" without becoming a HIPAA expert herself
- Ability to customize roles and permissions for her specific app

### Frustrations
- "I'm a clinical app developer, not a security engineer"
- Previous auth implementations required reading 200 pages of HIPAA docs
- Every app team asks the same questions: "How long should session timeouts be? What password policy do we need? Do we need MFA?"
- Testing auth flows is painful — setting up Keycloak locally took 2 days last time

### HIPAA Implications
- She should NOT need to understand HIPAA controls deeply — the platform should enforce them by default
- Her app should never see or store user passwords
- Token handling should be secure by default (HttpOnly cookies, not localStorage)
- Audit logging should happen automatically, not require her to instrument it

### Success Looks Like
- `npm install @healthgate/react` → add `<HealthGateLogin />` → authentication works
- `docker-compose up` for local development — Keycloak + Postgres pre-configured
- 5-page integration guide, not a 50-page manual
- Sensible HIPAA-compliant defaults that she doesn't need to configure
- TypeScript types for user objects, roles, and session data

---

## Persona 5: Dr. Robert Kim — CISO / Security Auditor (Stakeholder)

**Role:** Chief Information Security Officer, Google Health Division
**Age:** 52 | **Tech Comfort:** Expert (20+ years in healthcare security, HCISPP certified)

### Context
- Ultimately accountable for HIPAA compliance across all Google Health products
- Oversees penetration testing, security reviews, and incident response
- Presents compliance posture to the board quarterly
- Under pressure from the 2025 HIPAA Security Rule update

### Goals
- A single system to audit rather than 6+ separate auth implementations
- Demonstrable compliance with every §164.312 control
- Centralized threat detection across the auth perimeter
- Reduced attack surface through architectural isolation (3-zone model)
- Evidence-based compliance — not just policies, but proof of enforcement

### Frustrations
- "Every app team interprets HIPAA differently. I can't guarantee consistency"
- Penetration test findings repeat across apps — same vulnerabilities, different codebases
- No single dashboard for authentication security posture
- Incident investigation requires correlating logs from multiple systems

### HIPAA Implications
- He is the person who signs off on compliance
- He needs to see: encryption status, MFA enrollment rates, failed login trends, session policy enforcement, audit log integrity
- He needs the system to fail closed — deny access on error, not grant it

### Success Looks Like
- One security review instead of six
- HIPAA compliance dashboard with real-time control status
- Quarterly pen test scope reduced to one system
- Architectural isolation that limits blast radius of any breach
- Automated compliance evidence collection for OCR audits
