-- Examples — read-only demonstration reports surfaced to every user on the
-- dashboard. Promoted from a real report by a DEV-role user via
-- POST /api/reports/{id}/promote-to-example, which snapshots the report's
-- inputs / outputs into a new row here.
--
-- Translations on examples mirror the per-report cache: they're stored on the
-- example row itself and are visible to every user as soon as a DEV
-- generates them. The per-user `reports.translations` column is unaffected.
--
-- Shape of `translations`:
--   { "en": { "inputData": {...}, "resultData": {...}, "generatedAt": "ISO-8601" },
--     "es": { ... } }

CREATE TABLE examples (
    id                 UUID PRIMARY KEY,
    -- Stable, kebab-case identifier the dev supplies in the Promote modal.
    -- Also the segment used in the public URL — keep it URL-safe and short.
    slug               VARCHAR(120) NOT NULL UNIQUE,
    -- Display title (shown on the dashboard card + the report header).
    -- Snapshotted at promotion time; not necessarily the source report's title.
    title              VARCHAR(500) NOT NULL,
    -- Optional one-liner shown on hover / under the title.
    description        TEXT,
    -- ISO-639-1 code identifying the language of the snapshotted input_data /
    -- result_data. Translations to other languages live in the `translations`
    -- column.
    primary_language   VARCHAR(8) NOT NULL DEFAULT 'es',
    -- Full wizard inputs (companyProfile + globalSteep + steep + horizon).
    -- Same shape as `reports.input_data` so the report renderer can be
    -- pointed at either source without branching.
    input_data         JSONB NOT NULL,
    -- Full analysis output. Nullable for symmetry with `reports.result_data`
    -- but the Promote flow rejects reports that haven't generated their
    -- analysis yet — in practice this column is always non-null.
    result_data        JSONB,
    -- Per-language cache, keyed by ISO-639-1 code. Same shape as
    -- `reports.translations`.
    translations       JSONB,
    -- The dev who promoted the example. Audit only — examples are not
    -- "owned" by anyone; every DEV can edit and every user can read.
    created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Examples are listed on every dashboard load; an index on created_at keeps
-- the newest-first sort cheap as the table grows.
CREATE INDEX idx_examples_created_at ON examples(created_at DESC);
