-- Report translations cache.
--
-- Each report carries a single "primary language" (the language the wizard
-- generated it in) and an optional per-language map of translated copies in
-- the same shape as the primary {inputData, resultData}. Translations are
-- created on demand from the share/export dialogs and cached here so a
-- given report × target-language pair is only translated once.
--
-- Shape of `translations`:
--   { "en": { "inputData": {...}, "resultData": {...}, "generatedAt": "ISO-8601" },
--     "es": { ... } }
-- The entry whose key matches `primary_language` is generally absent — the
-- primary version is the report's own `input_data` / `result_data` columns.

ALTER TABLE reports
    ADD COLUMN translations      JSONB,
    ADD COLUMN primary_language  VARCHAR(8) NOT NULL DEFAULT 'es';

-- Index for filtering by primary language if the dashboard ever needs it.
CREATE INDEX idx_reports_primary_language ON reports(primary_language);
