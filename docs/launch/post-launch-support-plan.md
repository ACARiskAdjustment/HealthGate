# HealthGate Post-Launch Support Plan

## 1. Support Model

### 1.1 On-Call Rotation

| Tier | Team | Hours | Response SLA |
|---|---|---|---|
| Tier 1 — First Responder | Platform Engineering (SRE) | 24/7 | SEV-1: 5 min, SEV-2: 15 min, SEV-3: next business day |
| Tier 2 — Escalation | Security Engineering | Business hours + on-call | 30 min from escalation |
| Tier 3 — Expert | Keycloak/DB specialists | Business hours + on-call | 1 hour from escalation |

### 1.2 Severity Definitions

| Severity | Definition | Examples |
|---|---|---|
| SEV-1 | Authentication fully unavailable or security breach | All logins failing, signing key compromise, mass credential leak |
| SEV-2 | Degraded auth performance or partial outage | High latency (>5s p95), single replica down, elevated lockouts |
| SEV-3 | Non-urgent issue with workaround | UI cosmetic issue, non-critical log warning, feature request |

---

## 2. SLO Enforcement

### 2.1 Service Level Objectives

| SLO | Target | Measurement | Window |
|---|---|---|---|
| **Availability** | 99.95% | Login success rate (excluding invalid credentials) | Monthly rolling |
| **Login Latency (p50)** | < 500ms | Server-side measurement | Monthly rolling |
| **Login Latency (p95)** | < 2,000ms | Server-side measurement | Monthly rolling |
| **Token Refresh (p95)** | < 200ms | Client-side SDK timer | Monthly rolling |
| **Session Check (p95)** | < 100ms | /api/auth/session response time | Monthly rolling |

### 2.2 Error Budget Policy

**Monthly error budget:** 0.05% = 21.6 minutes of allowed downtime.

| Budget Status | Action |
|---|---|
| **>50% remaining** | Normal operations, standard deployment cadence |
| **25-50% remaining** | Caution mode — deployments require SRE approval |
| **<25% remaining** | Restricted — only critical security patches deployed |
| **Exhausted** | Freeze — all deployments halted until post-mortem completed and approved |

### 2.3 Error Budget Burn Rate Alerts

| Alert | Condition | Action |
|---|---|---|
| Fast burn (2% in 1 hour) | Consuming monthly budget at 14.4x rate | Page SRE immediately |
| Slow burn (5% in 6 hours) | Consuming monthly budget at 6x rate | Page SRE |
| Budget warning (50% consumed) | Half of monthly budget used | Slack warning to team |
| Budget critical (75% consumed) | Three-quarters of monthly budget used | Escalate to engineering lead |

---

## 3. Quarterly Compliance & Security Activities

### Q1 Schedule (Repeat Quarterly)

| Week | Activity | Owner | Deliverable |
|---|---|---|---|
| 1 | Penetration test (independent firm) | Security Team | Pen test report |
| 2-3 | Remediate pen test findings (Critical: 24h, High: 7d) | Engineering | Remediation evidence |
| 4 | Disaster recovery drill (failover + backup restore) | Platform Engineering | DR test report |
| 5 | Incident response tabletop exercise | Security Team | Exercise report |
| 6 | Admin account access review | IT Security Admin | Access review report |
| 8 | Backup restoration verification | DBA | Restoration test report |
| 10 | Quarterly security review meeting | All stakeholders | Meeting notes + action items |

### Monthly Activities

| Activity | Owner | Tool |
|---|---|---|
| Dependency vulnerability scan | Platform Engineering | `npm audit` + Snyk |
| Certificate expiry check | Platform Engineering | cert-manager dashboard |
| Container image rebuild (base image updates) | Platform Engineering | CI/CD pipeline |
| Audit log integrity verification (ongoing) | Automated | Hourly cron job (hash chain check) |

### Annual Activities

| Activity | Owner | Timeline |
|---|---|---|
| Comprehensive security assessment (third-party) | Security Team | Q4 annually |
| Penetration testing firm rotation evaluation | Security Team | Every 2 years |
| HIPAA compliance evidence package refresh | Compliance Team | Q2 annually |
| Architecture security review | Architecture Review Board | Q3 annually |
| Key rotation verification (all key types) | Security Team | Q1 annually |

---

## 4. Incident Review Process

### 4.1 Post-Incident Review Timeline

| Milestone | Timeline | Deliverable |
|---|---|---|
| Incident detection | T+0 | PagerDuty alert |
| Initial response | T+5 min (SEV-1) | Responder acknowledged |
| Situation report | T+30 min | Status update to stakeholders |
| Incident resolved | Varies (RTO: 15 min target) | Service restored |
| Timeline reconstruction | T+24 hours | Written timeline with evidence |
| Root cause analysis | T+48 hours | 5 Whys analysis document |
| Post-incident review meeting | T+72 hours | Meeting with action items |
| Remediation plan finalized | T+5 business days | Owner + deadline for each action |
| Remediation verified | Per plan | Evidence of fix deployed |
| 30-day follow-up | T+30 days | Verify all actions completed |

### 4.2 Post-Incident Review Template

```
## Incident Report: [INC-YYYY-NNN]

**Date:** YYYY-MM-DD
**Severity:** SEV-1/2/3
**Duration:** HH:MM (detection to resolution)
**Impact:** [Users affected, error rate, data exposure]

### Timeline
- HH:MM — [Event]
- HH:MM — [Event]

### Root Cause
[5 Whys analysis]

### What Went Well
- [Item]

### What Went Wrong
- [Item]

### Action Items
| # | Action | Owner | Due Date | Status |
|---|---|---|---|---|
| 1 | [Action] | [Owner] | YYYY-MM-DD | ☐ |

### HIPAA Breach Assessment
- Was ePHI accessed? [Yes/No]
- If yes, breach notification required per §164.404? [Yes/No]
- Notification status: [Pending/Completed/N/A]
```

---

## 5. Dependency Management

### 5.1 Patch Cadence

| Component | Scan Frequency | Patch SLA (Critical) | Patch SLA (High) |
|---|---|---|---|
| npm dependencies | Daily (Dependabot) | 24 hours | 7 days |
| Keycloak | Weekly check | 48 hours | 14 days |
| PostgreSQL | Weekly check | 48 hours | 14 days |
| Container base images | Weekly rebuild | 24 hours | 7 days |
| Node.js runtime | Monthly check | 7 days | 30 days |

### 5.2 Automated Scanning Pipeline

```
Daily:
  └─ Dependabot → PR with dependency updates
  └─ npm audit → Slack alert if critical/high

Per Commit (CI):
  └─ npm audit (fail on critical/high)
  └─ Trivy container scan (fail on critical/high)
  └─ TruffleHog secret detection

Weekly:
  └─ Snyk full dependency tree analysis
  └─ NVD feed check for Keycloak + PostgreSQL CVEs
  └─ Base image freshness check
```

---

## 6. Capacity Planning

### 6.1 Growth Projections

| Metric | Launch | +6 months | +12 months |
|---|---|---|---|
| Registered users | 10,000 | 50,000 | 200,000 |
| Peak concurrent sessions | 5,000 | 25,000 | 100,000 |
| Login rate (peak) | 100/sec | 300/sec | 1,000/sec |
| Storage (auth DB) | 5 GB | 20 GB | 80 GB |
| Audit log volume | 10 GB/month | 50 GB/month | 200 GB/month |

### 6.2 Scaling Triggers

| Trigger | Action | Lead Time |
|---|---|---|
| HPA consistently at max replicas | Increase max replicas or add node capacity | 1 week |
| DB connection pool > 80% sustained | Add PgBouncer replicas or increase pool size | 2 days |
| Elasticsearch storage > 70% | Expand storage or adjust ILM retention | 1 week |
| Login latency p95 trending toward 2s | Profile and optimize, consider caching | 2 weeks |

---

## 7. SDK Support

### 7.1 SDK Versioning

- **Semantic versioning:** MAJOR.MINOR.PATCH
- **Breaking changes:** Major version bump, 6-month deprecation notice
- **Security patches:** Released as PATCH versions, communicated via security advisory
- **LTS:** Each major version supported for 18 months after next major release

### 7.2 Integration Support

| Channel | Audience | Response SLA |
|---|---|---|
| GitHub Issues | External developers | 2 business days |
| #healthgate-sdk Slack | Internal teams | Same business day |
| SDK office hours (weekly) | All developers | Live Q&A every Thursday |

### 7.3 Known Limitations

| Limitation | Workaround | Planned Resolution |
|---|---|---|
| No SSR token injection | Use BFF proxy pattern | v2.0 (server components support) |
| Single realm per provider | Mount multiple providers | v1.1 (multi-realm support) |
| No React Native support | Use Keycloak OIDC directly | v2.0 (React Native SDK) |
