# HealthGate Go-Live Checklist & Deployment Runbook

## 1. Pre-Launch Verification

All items must be GREEN before proceeding to canary deployment.

### 1.1 Infrastructure Readiness

| # | Item | Owner | Status |
|---|---|---|---|
| 1 | Kubernetes namespace `healthgate-auth` provisioned with resource quotas | Platform Engineering | ☐ |
| 2 | Keycloak deployment running (3+ replicas, HPA configured) | Platform Engineering | ☐ |
| 3 | Next.js BFF deployment running (3+ replicas, HPA configured) | Platform Engineering | ☐ |
| 4 | PgBouncer deployment running (2 replicas, 200 max connections) | Platform Engineering | ☐ |
| 5 | PostgreSQL cluster healthy (Patroni primary + standby, replication lag < 1s) | DBA | ☐ |
| 6 | Network policies applied (default-deny, zone isolation verified) | Platform Engineering | ☐ |
| 7 | TLS certificates valid and auto-renewal configured (cert-manager) | Platform Engineering | ☐ |
| 8 | DNS records configured for production auth domain | Platform Engineering | ☐ |
| 9 | CDN configured for static assets (JS, CSS, fonts) | Platform Engineering | ☐ |
| 10 | Secrets stored in Vault (not env vars or config maps) | Security Team | ☐ |

### 1.2 Security Verification

| # | Item | Owner | Status |
|---|---|---|---|
| 11 | All 98 security launch checklist items GREEN | CISO | ☐ |
| 12 | Penetration test completed (independent firm, ≥ 4 weeks before launch) | Security Team | ☐ |
| 13 | All critical/high pen test findings remediated | Security Team | ☐ |
| 14 | Container images scanned by Trivy (0 critical/high CVEs) | Platform Engineering | ☐ |
| 15 | Dependency audit clean (npm audit, Snyk — 0 critical/high) | Platform Engineering | ☐ |
| 16 | Security headers verified (CSP, HSTS, X-Frame-Options, etc.) | Security Team | ☐ |
| 17 | HIPAA compliance assessment completed by third party | Compliance Team | ☐ |

### 1.3 Monitoring & Alerting

| # | Item | Owner | Status |
|---|---|---|---|
| 18 | Prometheus scraping Keycloak `/metrics` and BFF `/api/metrics` | Platform Engineering | ☐ |
| 19 | All 15 Prometheus alert rules active and tested | Platform Engineering | ☐ |
| 20 | PagerDuty integration verified (test page sent and received) | Platform Engineering | ☐ |
| 21 | Grafana dashboards populated (Auth Overview, Sessions, Security, Infra) | Platform Engineering | ☐ |
| 22 | Elasticsearch receiving audit logs (test event visible) | Platform Engineering | ☐ |
| 23 | Audit log hash chain verification job scheduled (hourly) | Platform Engineering | ☐ |

### 1.4 Testing Complete

| # | Item | Owner | Status |
|---|---|---|---|
| 24 | Unit tests passing (103/103) | Engineering | ☐ |
| 25 | E2E tests passing (Playwright, all browsers) | QA | ☐ |
| 26 | Load test passed (500 logins/sec sustained, 50K concurrent sessions) | Platform Engineering | ☐ |
| 27 | Failover test completed (Keycloak pod kill → recovery < 30s) | Platform Engineering | ☐ |
| 28 | Database failover test completed (Patroni primary kill → auto-failover) | DBA | ☐ |
| 29 | Backup restoration test completed (PITR to specific timestamp) | DBA | ☐ |
| 30 | Emergency rollback procedure tested (< 5 minutes) | Platform Engineering | ☐ |

### 1.5 Documentation & Sign-Offs

| # | Item | Owner | Status |
|---|---|---|---|
| 31 | SDK integration guide published | Engineering | ☐ |
| 32 | Operations runbook published | Platform Engineering | ☐ |
| 33 | HIPAA compliance package assembled | Compliance Team | ☐ |
| 34 | Incident response runbooks published and reviewed | Security Team | ☐ |
| 35 | CISO sign-off obtained | Dr. Robert Kim | ☐ |
| 36 | Privacy Counsel sign-off obtained | Legal | ☐ |
| 37 | VP Engineering sign-off obtained | VP Engineering | ☐ |
| 38 | IT Security Admin sign-off obtained | James Park | ☐ |

---

## 2. Canary Deployment Procedure

### 2.1 Pre-Canary (T-30 min)

```
[ ] Verify all pre-launch items are GREEN (Section 1)
[ ] Notify on-call SRE and security team: "HealthGate canary deployment starting"
[ ] Open Grafana dashboards on monitoring screen
[ ] Verify PagerDuty on-call schedule is current
[ ] Record baseline metrics (login rate, error rate, latency p95)
```

### 2.2 Stage 1: Canary (10% traffic)

**Duration:** 30 minutes minimum

```bash
# Deploy canary
kubectl set image deployment/nextjs-bff \
  nextjs-bff=gcr.io/healthgate/nextjs-bff:$NEW_TAG \
  -n healthgate-auth

# Configure traffic split (Istio VirtualService or Argo Rollouts)
# Route 10% of traffic to new pods
```

**Monitor for 30 minutes:**

| Metric | Abort If |
|---|---|
| Error rate | > 0.1% (vs baseline) |
| Login latency (p95) | > 2 seconds |
| New CRITICAL alerts | Any |
| Pod restarts | Any new restarts |
| Audit log hash chain | Any verification failure |

**Abort procedure:**
```bash
kubectl rollout undo deployment/nextjs-bff -n healthgate-auth
# Notify team: "Canary aborted — investigating"
```

### 2.3 Stage 2: Full Rollout (100% traffic)

```bash
# Promote canary to full rollout
kubectl rollout resume deployment/nextjs-bff -n healthgate-auth

# Verify all pods updated
kubectl rollout status deployment/nextjs-bff -n healthgate-auth
```

### 2.4 Post-Deploy Monitoring (2 hours)

```
[ ] Error rate remains < 0.1%
[ ] Login latency p95 < 2 seconds
[ ] No new CRITICAL or WARNING alerts
[ ] Audit logs flowing to Elasticsearch
[ ] Session timeout warning functioning (test with staging account)
[ ] MFA challenge flow functioning (test with staging account)
[ ] Cross-tab session sync working (open 2 tabs, logout in one)
```

---

## 3. Rollback Triggers

Automatic rollback (if using Argo Rollouts) or manual rollback if any of:

| Trigger | Threshold | Action |
|---|---|---|
| Error rate spike | > 1% for 2 minutes | Immediate rollback |
| Login latency degradation | p95 > 5 seconds for 5 minutes | Immediate rollback |
| Keycloak connectivity loss | > 30 seconds | Investigate, rollback if not resolved in 5 min |
| CRITICAL alert fired | Any new CRITICAL | Investigate, rollback if auth-related |
| Data integrity | Audit hash chain break | Immediate rollback + incident |

### Rollback Procedure

```bash
# 1. Rollback deployment
kubectl rollout undo deployment/nextjs-bff -n healthgate-auth

# 2. Verify rollback
kubectl rollout status deployment/nextjs-bff -n healthgate-auth
kubectl get pods -n healthgate-auth

# 3. Notify stakeholders
# Slack: #healthgate-launch "Rollback executed — investigating [reason]"

# 4. Verify service restored
curl -sf https://auth.googlehealth.com/api/healthz
curl -sf https://auth.googlehealth.com/api/readyz

# 5. File incident report within 24 hours
```

---

## 4. Post-Launch Plan

### 4.1 Intensive Monitoring Period (First 48 hours)

- On-call SRE dedicated to HealthGate monitoring
- 15-minute check-ins for first 4 hours
- Hourly check-ins for remaining 44 hours
- Escalation threshold lowered (WARNING alerts → page)

### 4.2 30-Day Baseline Period

During the first 30 days:
- Establish baseline metrics for all SLOs
- Error budget enforcement is informational only (no deployment freeze)
- Weekly review of metrics with Platform Engineering + Security
- Collect feedback from first integrating application team

### 4.3 Error Budget Policy (Effective Day 31)

| Monthly Uptime | Error Budget Remaining | Policy |
|---|---|---|
| > 99.95% | > 0% | Normal deployment cadence |
| 99.90% - 99.95% | Budget consumed | Caution — only critical fixes deployed |
| < 99.90% | Budget exceeded | Deployment freeze until post-mortem completed |

**Error budget calculation:**
- Monthly minutes: 43,200 (30 days)
- 0.05% budget: 21.6 minutes of downtime allowed
- Measured as: minutes where login success rate < 99% OR p95 latency > 5s

---

## 5. Communication Plan

### 5.1 Pre-Launch Notifications

| When | Who | Channel | Message |
|---|---|---|---|
| T-7 days | All stakeholders | Email | Launch date confirmed, final checklist review |
| T-1 day | Engineering + SRE | Slack #healthgate-launch | Pre-launch freeze (no non-launch changes) |
| T-30 min | On-call SRE + Security | Slack + PagerDuty | Canary deployment starting |

### 5.2 Launch Day Notifications

| When | Who | Channel | Message |
|---|---|---|---|
| Canary start | Engineering | Slack #healthgate-launch | "Canary deployed — monitoring" |
| Canary success | Engineering | Slack #healthgate-launch | "Canary passed — promoting to 100%" |
| Full rollout | All stakeholders | Email + Slack | "HealthGate is live in production" |
| +2 hours | Engineering | Slack #healthgate-launch | "Post-deploy monitoring complete — stable" |

### 5.3 Incident Communication

| Severity | Notification | Timeline |
|---|---|---|
| SEV-1 | PagerDuty + Slack + Email to CISO | Immediate |
| SEV-2 | PagerDuty + Slack | Within 15 minutes |
| SEV-3 | Slack #healthgate-ops | Next business day |

---

## 6. Success Criteria Summary

Launch is considered successful when:

- [ ] All 38 pre-launch items verified GREEN
- [ ] Canary deployment passed 30-minute monitoring window
- [ ] Full rollout completed with 0 rollbacks
- [ ] 2-hour post-deploy monitoring shows stable metrics
- [ ] 48-hour intensive monitoring period completes without SEV-1/2 incidents
- [ ] First integrating application team confirms SDK working in staging
- [ ] 30-day baseline period establishes SLO targets
