-- Multi-lingual share tokens.
--
-- Until now a share token froze ONE language at creation time (the
-- sharer picked it in the modal, the recipient saw that one). To let
-- recipients toggle between cached translations (matching the in-app
-- viewer's language switcher), the share snapshot grows to carry every
-- language the source had cached at share time.
--
-- Shape of `translations`:
--   { "en": { "inputData": {...}, "resultData": {...}, "generatedAt": "ISO-8601" },
--     "es": { ... } }
-- Mirrors `reports.translations` exactly. The entry whose key matches
-- `primary_language` is generally absent — that one lives in the
-- share's `input_data` / `result_data` columns.
--
-- Existing rows are left as-is: `translations` is NULL (single-language
-- share, no toggle on the public page), `primary_language` falls back
-- to 'es' which matches the demo default. New shares populate both.

ALTER TABLE share_tokens
    ADD COLUMN translations      JSONB,
    ADD COLUMN primary_language  VARCHAR(8) NOT NULL DEFAULT 'es';
