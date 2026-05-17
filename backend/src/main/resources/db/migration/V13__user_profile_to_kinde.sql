-- ============================================================
-- V13 — Move profile fields to Kinde (single source of truth)
--
-- Previously: users.name + users.language were mirrored locally,
-- kept in sync via webhook + lazy-create + on-save push to Kinde.
-- That meant two places for the same data and a divergence window
-- on every write (local-saves-but-Kinde-fails, vice versa).
--
-- Now: Kinde is authoritative for the full profile.
--   - name → Kinde stock fields (first_name + last_name)
--   - language → Kinde Property `language` (defined in
--     Kinde Dashboard → Settings → Properties; default "es")
-- The local row only keeps id, external_user_id, role (auth
-- concern — checked on every request, too hot to fetch from
-- Kinde), and the M3 subscription fields (which we may also
-- migrate later — see ROADMAP).
--
-- Schema drift on this branch only — Foresight isn't in prod
-- yet (M4 still open), so we don't backfill into Kinde first.
-- A dev DB started before this migration loses the values; the
-- next login backfills name from the JWT claims via Kinde itself.
-- ============================================================

ALTER TABLE users DROP COLUMN IF EXISTS name;
ALTER TABLE users DROP COLUMN IF EXISTS language;
