CREATE TABLE share_tokens (
    id           UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    token        VARCHAR(64)  NOT NULL UNIQUE,
    report_id    UUID         NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    user_id      UUID         NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    title        VARCHAR(500) NOT NULL,
    input_data   JSONB        NOT NULL,
    result_data  JSONB,
    expires_at   TIMESTAMPTZ  NOT NULL,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_share_tokens_token       ON share_tokens(token);
CREATE INDEX idx_share_tokens_report_id   ON share_tokens(report_id);
CREATE INDEX idx_share_tokens_expires_at  ON share_tokens(expires_at);
