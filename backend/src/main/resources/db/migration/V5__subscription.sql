-- Subscription state mirrored locally so we can gate report creation without calling Clerk
-- on every request. Source of truth is Clerk Billing (which wraps Stripe); these columns are
-- kept in sync via the Clerk webhook. All nullable: existing rows have no subscription, and
-- a user without an active period is treated as "no plan".

ALTER TABLE users
    ADD COLUMN subscription_plan                 VARCHAR(64),
    ADD COLUMN subscription_current_period_start TIMESTAMPTZ,
    ADD COLUMN subscription_current_period_end   TIMESTAMPTZ;

-- Whitelist of valid plan slugs. New tiers go here in their own migration so an unexpected
-- value from a webhook (typo, spec drift) fails loudly instead of silently bypassing gates.
ALTER TABLE users
    ADD CONSTRAINT users_subscription_plan_check
    CHECK (subscription_plan IS NULL OR subscription_plan IN ('FUTUROS_PLATAFORMA'));

-- Counting reports in the current billing period uses (user_id, created_at). The existing
-- idx_reports_user_id covers the user_id half; this composite index makes the period filter
-- a range scan instead of a sort.
CREATE INDEX idx_reports_user_id_created_at ON reports(user_id, created_at DESC);
