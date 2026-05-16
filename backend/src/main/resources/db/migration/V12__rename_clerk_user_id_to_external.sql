-- Rename clerk_user_id to external_user_id to make the identity column
-- provider-agnostic ahead of the Clerk → Kinde migration.
--
-- The column will still hold Clerk user identifiers immediately after this
-- migration; it only starts holding Kinde identifiers once the JWT decoder
-- and webhook receiver are swapped (Phases 2 and 3 of the migration plan).
-- The underlying value is a free-form string sourced from the JWT `sub`
-- claim, so no data migration is required — this rename is purely lexical.
--
-- After this migration:
--   * Column        users.clerk_user_id        → users.external_user_id
--   * Unique index  uk_users_clerk_user_id     → uk_users_external_user_id
--
-- See docs/MIGRATION_CLERK_TO_KINDE.md for the full migration plan.

ALTER TABLE users RENAME COLUMN clerk_user_id TO external_user_id;
ALTER INDEX uk_users_clerk_user_id RENAME TO uk_users_external_user_id;
