-- HealthGate Custom Tables
-- These extend Keycloak's schema with HealthGate-specific tables.
-- Run after Keycloak initializes its own schema.

-- Trusted devices for MFA bypass (FR21)
CREATE TABLE IF NOT EXISTS trusted_device (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL,
    device_fingerprint  VARCHAR(64) NOT NULL,      -- SHA-256 hash
    user_agent_family   VARCHAR(255),
    created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    expires_at          TIMESTAMP WITH TIME ZONE NOT NULL,
    last_used_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_trusted_device_user
        FOREIGN KEY (user_id)
        REFERENCES user_entity(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_trusted_user
    ON trusted_device (user_id);

CREATE INDEX IF NOT EXISTS idx_trusted_expires
    ON trusted_device (expires_at);

-- Device login history for anomaly detection
CREATE TABLE IF NOT EXISTS device_login_history (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL,
    ip_address          VARCHAR(45) NOT NULL,       -- IPv4 or IPv6
    ip_subnet_24        VARCHAR(18),                -- /24 prefix for pattern matching
    user_agent_family   VARCHAR(255),
    geo_city            VARCHAR(255),
    geo_country         VARCHAR(2),                 -- ISO 3166-1 alpha-2
    first_seen_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_seen_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_device_history_user
        FOREIGN KEY (user_id)
        REFERENCES user_entity(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_device_history_user
    ON device_login_history (user_id, last_seen_at DESC);

-- Recovery codes for MFA fallback (FR8)
CREATE TABLE IF NOT EXISTS recovery_code (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL,
    code_hash           VARCHAR(72) NOT NULL,       -- bcrypt, cost 12
    used                BOOLEAN NOT NULL DEFAULT FALSE,
    used_at             TIMESTAMP WITH TIME ZONE,
    created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_recovery_code_user
        FOREIGN KEY (user_id)
        REFERENCES user_entity(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_recovery_user
    ON recovery_code (user_id, used);
