-- Auth-related short-lived tokens: password reset + email verification.
--
-- Security notes:
--   * We NEVER store the raw token. The user receives the raw token by email; we store
--     only its SHA-256 hash so that a DB leak does not hand attackers a pile of valid
--     tokens. Verification compares `sha256(incoming)` against the stored hash.
--   * Tokens are single-use: `used_at` is stamped the first time the token is redeemed,
--     and subsequent lookups filter it out.
--   * `expires_at` is enforced at read time in the service (plus serves as a TTL column
--     for any periodic cleanup job we add later).
--   * `ON DELETE CASCADE` keeps tokens in sync when a user is deleted.

CREATE TABLE password_reset_tokens (
    id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash   VARCHAR(64) NOT NULL UNIQUE,
    expires_at   TIMESTAMPTZ NOT NULL,
    used_at      TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
CREATE INDEX idx_password_reset_tokens_expires_at ON password_reset_tokens(expires_at);

CREATE TABLE email_verification_tokens (
    id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash   VARCHAR(64) NOT NULL UNIQUE,
    expires_at   TIMESTAMPTZ NOT NULL,
    used_at      TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_email_verification_tokens_user_id ON email_verification_tokens(user_id);
CREATE INDEX idx_email_verification_tokens_expires_at ON email_verification_tokens(expires_at);
