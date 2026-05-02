-- Switch authentication ownership from the local backend to Clerk.
--
-- Effects on the schema:
--   * `clerk_user_id` is added to `users` and becomes the lookup key the API uses to map
--     a Clerk session JWT (sub claim) to a local row.
--   * Password storage and email-verification state move into Clerk, so the corresponding
--     columns and short-lived-token tables are dropped.
--
-- Migration policy: `clerk_user_id` is created as nullable so this script is safe to run
-- on environments that already contain user rows (those will need a separate bulk import
-- to Clerk before they can authenticate again). In a fresh environment all rows will be
-- back-filled by the `user.created` webhook or by the lazy-sync path in `UserService`.

ALTER TABLE users ADD COLUMN clerk_user_id VARCHAR(255);
CREATE UNIQUE INDEX uk_users_clerk_user_id ON users(clerk_user_id);

ALTER TABLE users DROP COLUMN password;
ALTER TABLE users DROP COLUMN email_verified;

DROP TABLE IF EXISTS password_reset_tokens;
DROP TABLE IF EXISTS email_verification_tokens;
