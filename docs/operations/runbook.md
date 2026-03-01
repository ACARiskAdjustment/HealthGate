# HealthGate Operations Runbook

## 1. Architecture Overview

HealthGate uses a 3-zone isolation model:

| Zone | Components | Purpose |
|---|---|---|
| Zone 1 — Auth Plane | Keycloak (3+ replicas), PostgreSQL (Patroni), PgBouncer | Identity provider, credential storage |
| Zone 2 — Gateway | Next.js BFF (3-50 replicas), Middleware | Session management, token brokering |
| Zone 3 — PHI Data Plane | Application databases | Patient data (no direct auth access) |

**Namespace:** `healthgate-auth`
**Network policies:** Default-deny with explicit allow rules between zones.

---

## 2. Deployment Procedures

### 2.1 Docker Compose (Development)

```bash
# Start all services
docker compose up -d

# View logs
docker compose logs -f nextjs-bff
docker compose logs -f keycloak

# Restart a single service
docker compose restart keycloak

# Full teardown (preserves volumes)
docker compose down

# Full teardown (destroys volumes)
docker compose down -v
```

### 2.2 Kubernetes Production Deployment

**Prerequisites:** kubectl configured, access to `healthgate-auth` namespace.

```bash
# Apply all manifests
kubectl apply -f k8s/base/

# Verify rollout
kubectl rollout status deployment/keycloak -n healthgate-auth
kubectl rollout status deployment/nextjs-bff -n healthgate-auth

# Check pod health
kubectl get pods -n healthgate-auth -o wide
```

### 2.3 Canary Deployment

```bash
# Step 1: Deploy canary (10% traffic via Istio/Argo Rollouts)
kubectl set image deployment/nextjs-bff \
  nextjs-bff=gcr.io/healthgate/nextjs-bff:NEW_TAG \
  -n healthgate-auth

# Step 2: Monitor for 30 minutes
#   - Error rate < 0.1%
#   - Latency p95 < 2 seconds
#   - No new critical alerts

# Step 3: Promote to 100%
kubectl rollout resume deployment/nextjs-bff -n healthgate-auth

# Step 4: Post-deploy monitoring (2 hours intensive)
```

### 2.4 Emergency Rollback

**Max rollback time: 5 minutes**

```bash
# Rollback Next.js BFF
kubectl rollout undo deployment/nextjs-bff -n healthgate-auth

# Rollback Keycloak
kubectl rollout undo deployment/keycloak -n healthgate-auth

# Verify rollback
kubectl rollout status deployment/nextjs-bff -n healthgate-auth
kubectl rollout status deployment/keycloak -n healthgate-auth

# Check pods are healthy
kubectl get pods -n healthgate-auth
```

---

## 3. Health Check Endpoints

| Endpoint | Purpose | Expected Response | Used By |
|---|---|---|---|
| `GET /api/healthz` | Liveness probe | `200 { status: "ok", uptime: N, timestamp: "..." }` | K8s liveness probe |
| `GET /api/readyz` | Readiness probe | `200 { status: "ready", checks: [...] }` | K8s readiness probe |
| `GET /api/metrics` | Prometheus metrics | Prometheus text exposition format | Prometheus scraper |

**Readiness checks:**
- Keycloak connectivity (OIDC well-known endpoint reachable)
- Encryption key configured (COOKIE_ENCRYPTION_KEY present and valid length)
- Memory usage (heap < 90% of limit)

**Failure response (readyz):**
```json
{
  "status": "not_ready",
  "checks": [
    { "name": "keycloak", "status": "fail", "message": "OIDC endpoint unreachable" },
    { "name": "encryption_key", "status": "pass" },
    { "name": "memory", "status": "pass" }
  ]
}
```

---

## 4. Monitoring & Alerting

### 4.1 Prometheus Metrics

**BFF Custom Metrics** (exported at `/api/metrics`):

| Metric | Type | Labels | Description |
|---|---|---|---|
| `healthgate_bff_request_duration_seconds` | Histogram | route, method, status_code | Request latency |
| `healthgate_bff_token_refresh_duration_seconds` | Histogram | result | Token refresh latency |
| `healthgate_bff_csrf_validation_failures_total` | Counter | route | CSRF validation failures |
| `healthgate_bff_cookie_encryption_errors_total` | Counter | operation | Cookie encrypt/decrypt errors |
| `healthgate_bff_rate_limit_hits_total` | Counter | route, ip | Rate limit triggers |

**Keycloak Metrics** (scraped from Keycloak's `/metrics` endpoint):
- `keycloak_logins` — Login events by realm, client, result
- `keycloak_registrations` — Registration events
- `keycloak_failed_login_attempts` — Failed login attempts

### 4.2 Critical Alerts (PagerDuty)

| Alert | Condition | Severity |
|---|---|---|
| LoginFailureRateHigh | Failed logins > 10% of total for 5 min | CRITICAL |
| KeycloakDown | All Keycloak replicas unavailable for 2 min | CRITICAL |
| DBFailover | PostgreSQL failover event detected | CRITICAL |
| ZeroLogins | No successful logins for 2 min during business hours | CRITICAL |
| AuditHashChainBroken | Hash chain verification failure | CRITICAL |

### 4.3 Warning Alerts (Slack)

| Alert | Condition | Severity |
|---|---|---|
| ElevatedLockouts | Account lockout rate > 5/min for 10 min | WARNING |
| CertExpiringSoon | TLS cert expires in < 30 days | WARNING |
| DiskUsageHigh | Filesystem > 80% | WARNING |
| HighLoginLatency | Login p95 > 3 seconds for 10 min | WARNING |
| PgBouncerSaturation | Connection pool > 80% for 5 min | WARNING |
| TokenRefreshFailureRate | Token refresh failures > 5% for 5 min | WARNING |
| MFAFailureRateHigh | MFA failures > 20% for 10 min | WARNING |

### 4.4 Grafana Dashboards

| Dashboard | Key Panels |
|---|---|
| **Auth Overview** | Login rate, failure rate, latency p50/p95/p99, active sessions |
| **Session Management** | Active sessions, idle timeouts, session extensions, concurrent sessions |
| **Security** | Account lockouts, brute-force attempts, rate limit hits, MFA failures |
| **Infrastructure** | CPU/memory usage, pod count, DB connections, request queue depth |

---

## 5. Key Rotation Procedures

### 5.1 JWT Signing Key (90-day rotation)

```bash
# 1. Generate new key pair in Keycloak
# Admin Console → Realm Settings → Keys → Providers → Add rsa-generated

# 2. Set new key as active (old key enters grace period)
# The 30-day grace period allows existing tokens to validate against the old key

# 3. After 30 days, disable the old key
# Admin Console → Keys → Set old key to "Passive"

# 4. After tokens with old key expire (max 5 min access token lifetime), remove old key
```

**Emergency key rotation (< 5 minutes):**
```bash
# 1. Generate new key pair
curl -X POST "https://auth.googlehealth.com/admin/realms/healthgate-clinician/keys" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"emergency-key","providerId":"rsa-generated","config":{"priority":["200"],"keySize":["2048"]}}'

# 2. Immediately disable compromised key
# Admin Console → Keys → Set compromised key to "Disabled"

# 3. All active sessions will need to re-authenticate (access tokens max 5 min TTL)
```

### 5.2 Cookie Encryption Key (90-day rotation)

```bash
# 1. Generate new 32-byte hex key
openssl rand -hex 32

# 2. Update COOKIE_ENCRYPTION_KEY in Vault/K8s secret
kubectl create secret generic healthgate-secrets \
  --from-literal=COOKIE_ENCRYPTION_KEY=<new-key> \
  -n healthgate-auth --dry-run=client -o yaml | kubectl apply -f -

# 3. Rolling restart of BFF pods (picks up new secret)
kubectl rollout restart deployment/nextjs-bff -n healthgate-auth

# NOTE: Users with cookies encrypted with the old key will be logged out
# and need to re-authenticate. This is expected and safe.
```

### 5.3 mTLS Certificate Rotation (365-day)

Managed by cert-manager with automatic renewal 30 days before expiry. Manual rotation:

```bash
# 1. Verify cert-manager is renewing
kubectl get certificate -n healthgate-auth

# 2. Force renewal if needed
kubectl cert-manager renew healthgate-mtls -n healthgate-auth

# 3. Verify new cert is active
kubectl get secret healthgate-mtls-tls -n healthgate-auth -o jsonpath='{.metadata.annotations}'
```

---

## 6. Database Operations

### 6.1 PostgreSQL Failover (Patroni)

Patroni handles automatic failover. Manual intervention:

```bash
# Check cluster status
kubectl exec -it patroni-0 -n healthgate-auth -- patronictl list

# Manual failover
kubectl exec -it patroni-0 -n healthgate-auth -- patronictl failover

# Verify new primary
kubectl exec -it patroni-0 -n healthgate-auth -- patronictl list
```

### 6.2 Backup & Restore

**Automated backups:** WAL-E/WAL-G continuous archiving to S3.
**RPO:** < 5 minutes (WAL archiving every 60 seconds).

```bash
# Point-in-time restore
# 1. Stop the application (scale BFF to 0)
kubectl scale deployment/nextjs-bff --replicas=0 -n healthgate-auth

# 2. Restore from backup
kubectl exec -it patroni-0 -n healthgate-auth -- \
  wal-g backup-fetch /var/lib/postgresql/data LATEST

# 3. Set recovery target time
echo "recovery_target_time = '2026-03-01 12:00:00 UTC'" >> /var/lib/postgresql/data/recovery.conf

# 4. Start PostgreSQL and verify
kubectl exec -it patroni-0 -n healthgate-auth -- pg_ctl start

# 5. Scale BFF back up
kubectl scale deployment/nextjs-bff --replicas=3 -n healthgate-auth
```

### 6.3 PgBouncer Management

```bash
# Check connection pool status
kubectl exec -it pgbouncer-0 -n healthgate-auth -- \
  psql -p 6432 pgbouncer -c "SHOW POOLS;"

# Check active connections
kubectl exec -it pgbouncer-0 -n healthgate-auth -- \
  psql -p 6432 pgbouncer -c "SHOW CLIENTS;"

# Reload config
kubectl exec -it pgbouncer-0 -n healthgate-auth -- \
  psql -p 6432 pgbouncer -c "RELOAD;"
```

---

## 7. Scaling

### 7.1 Horizontal Pod Autoscaler

| Component | Min Replicas | Max Replicas | Scale-Up Trigger |
|---|---|---|---|
| Keycloak | 3 | 10 | CPU > 70% or Memory > 80% |
| Next.js BFF | 3 | 50 | CPU > 70% or Memory > 80% |
| PgBouncer | 2 | 4 | Manual only |

```bash
# Check HPA status
kubectl get hpa -n healthgate-auth

# Manual scale override
kubectl scale deployment/nextjs-bff --replicas=10 -n healthgate-auth

# View scaling events
kubectl describe hpa nextjs-bff-hpa -n healthgate-auth
```

### 7.2 Load Testing

```bash
# Run k6 load test (baseline scenario)
k6 run --env BASE_URL=https://staging.auth.googlehealth.com tests/load/k6-auth-flows.js

# Run specific scenario
k6 run --env BASE_URL=https://staging.auth.googlehealth.com \
  --tag scenario=peak_load tests/load/k6-auth-flows.js
```

---

## 8. Break-Glass Admin Access

For emergency situations requiring direct admin access:

```bash
# 1. Authenticate with break-glass credentials (stored in Vault)
vault read secret/healthgate/break-glass

# 2. Access Keycloak Admin Console
# URL: https://auth.googlehealth.com/admin/
# Use break-glass credentials

# 3. All break-glass access is logged to audit trail
# Event type: ADMIN_BREAK_GLASS

# 4. After emergency resolved:
#    - Rotate break-glass credentials
#    - File incident report
#    - Conduct post-incident review within 24 hours
```

---

## 9. Troubleshooting

### Pod CrashLooping

```bash
# Check pod logs
kubectl logs <pod-name> -n healthgate-auth --previous

# Check events
kubectl describe pod <pod-name> -n healthgate-auth

# Common causes:
# - COOKIE_ENCRYPTION_KEY not set or wrong length (must be 64 hex chars)
# - Keycloak DB connection refused (check PgBouncer)
# - OOM killed (check resource limits)
```

### High Login Latency

1. Check Keycloak pod CPU/memory: `kubectl top pods -n healthgate-auth`
2. Check PgBouncer pool saturation: `SHOW POOLS;`
3. Check network policies aren't blocking: `kubectl get networkpolicy -n healthgate-auth`
4. Review BFF request duration histogram in Grafana

### Authentication Failures Spike

1. Check if brute-force attack: review `healthgate_bff_rate_limit_hits_total` metric
2. Check Keycloak logs: `kubectl logs -l app=keycloak -n healthgate-auth | grep ERROR`
3. Check if cert expired: `kubectl get certificate -n healthgate-auth`
4. Verify OIDC well-known endpoint: `curl https://auth.googlehealth.com/realms/healthgate-clinician/.well-known/openid-configuration`
