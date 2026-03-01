# HealthGate Incident Response Runbook Index

## Incident Types

| ID | Incident | Severity | Indicators |
|---|---|---|---|
| INC-AUTH-01 | Mass Credential Compromise | SEV-1 | Abnormal login success from new IPs; database access anomaly |
| INC-AUTH-02 | Signing Key Compromise | SEV-1 | Tokens with unknown `kid`; future `iat`; unauthorized Vault access |
| INC-AUTH-03 | Account Takeover (Individual) | SEV-2 | User-reported unauthorized activity; impossible geography |
| INC-AUTH-04 | Brute-Force / Credential Stuffing | SEV-2 | Login failure rate >10% for 5+ min; mass lockouts |
| INC-AUTH-05 | Privilege Escalation | SEV-1 | Unauthorized admin API calls; unexpected role claims |
| INC-AUTH-06 | Audit Log Integrity Failure | SEV-1 | Hash chain failure; missing sequence numbers |
| INC-AUTH-07 | Keycloak Service Compromise | SEV-1 | Unexpected process execution; config drift |
| INC-AUTH-08 | Certificate/TLS Compromise | SEV-2 | CT log anomaly; MITM evidence |
| INC-AUTH-09 | Denial of Service (Auth) | SEV-2 | Health check failures; all replicas degraded |
| INC-AUTH-10 | SAML Federation Compromise | SEV-2 | Unusual assertion patterns; federated IdP breach |

## Operational Runbooks

| Runbook | Trigger | Key Commands |
|---|---|---|
| RB-001 | Keycloak Pod Failure | `kubectl get pods -n healthgate-auth`, `kubectl logs`, `kubectl describe pod` |
| RB-002 | PostgreSQL Failover | Check Patroni: `patronictl list`, verify PgBouncer routing |
| RB-003 | Full Auth Outage | Verify all replicas, check upstream dependencies, trigger incident page |
| RB-004 | Token Signing Key Compromise | Emergency key rotation via Vault API (<5 min), invalidate all sessions |
| RB-005 | Brute Force Attack | Review audit logs, check lockout rates, consider IP blocking |
| RB-006 | Elasticsearch Cluster Failure | Check cluster health, verify snapshot restoration |
| RB-007 | Certificate Expiry | Check cert-manager, manual renewal if needed |
| RB-008 | Database Restore (PITR) | `pg_basebackup` restore + WAL replay to target timestamp |
| RB-009 | Emergency Rollback | `kubectl rollout undo deployment/keycloak -n healthgate-auth` |
| RB-010 | Vault Unsealing | Check auto-unseal with Cloud KMS, manual unseal if needed |

## Escalation Matrix

| Severity | Initial Responder | 15-min Escalation | 1-hour Escalation | 4-hour Escalation |
|---|---|---|---|---|
| SEV-1 | On-call Platform Engineer | Security Lead + CISO | VP Engineering + Legal | C-Suite briefing |
| SEV-2 | On-call Platform Engineer | Security Lead | CISO | VP Engineering |
| SEV-3 | Platform Engineering team | Security Lead (next business day) | — | — |

## Response Procedures

### INC-AUTH-01: Mass Credential Compromise

1. **IMMEDIATE (0-15 min):** Page CISO and security team. Confirm scope via audit logs.
2. **CONTAINMENT (15-60 min):** Force password reset for all affected accounts. Invalidate all active sessions. Rotate JWT signing keys. Disable compromised service accounts.
3. **ERADICATION (1-24 hr):** Identify root cause. Patch vulnerability. Reset all credentials if DB compromise confirmed.
4. **RECOVERY (24-72 hr):** Re-enable accounts with mandatory password reset + MFA re-enrollment. Monitor.
5. **POST-INCIDENT:** 72-hour regulatory notification (2025 NPRM). Post-incident review within 5 business days.

### INC-AUTH-02: Signing Key Compromise

1. **IMMEDIATE (0-5 min):** Emergency key rotation via Vault API. Publish new JWKS.
2. **CONTAINMENT (5-30 min):** Invalidate all tokens signed with compromised key. Force re-authentication.
3. **ERADICATION (30 min-24 hr):** Investigate root cause. Revoke Vault access for compromised accounts.
4. **RECOVERY (24-48 hr):** Confirm all services using new key. Verify no forged tokens in circulation.
5. **POST-INCIDENT:** 72-hour regulatory notification. Post-incident review.

### INC-AUTH-04: Brute-Force / Credential Stuffing

1. **IMMEDIATE:** Verify alert via audit logs (`event_type=LOGIN_ERROR` spikes).
2. **ASSESS:** Check if attack is distributed (many IPs) or concentrated.
3. **MITIGATE:** For concentrated attacks, add temporary IP blocks. For distributed, increase rate limit strictness.
4. **MONITOR:** Watch lockout rates and global failure rate for next 4 hours.
5. **POST-INCIDENT:** Document attack patterns. Update rate limit configs if needed.

## Post-Incident Review Process

1. Timeline reconstruction from audit logs and monitoring (within 24 hours)
2. Root cause analysis (5 Whys method)
3. Impact assessment: accounts affected, data exposed, duration
4. Control gap analysis: which controls failed/worked
5. Remediation plan with owners and deadlines
6. Lessons learned shared with engineering and security teams
7. Threat model update
8. Regulatory notification if required (72 hours HIPAA; state breach laws)
9. 30-day follow-up verification
