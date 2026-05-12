-- share_tokens now sources from either a report OR an example. Examples
-- live in their own table (see V8) and have completely different ownership
-- semantics — anyone authenticated can mint a share against them — so a
-- single NOT NULL FK to reports doesn't fit.
--
-- We loosen report_id (now nullable) and add a parallel example_id, then
-- enforce "exactly one source" with a CHECK constraint. Both columns
-- carry ON DELETE CASCADE so deleting either the source report or the
-- source example tears down the matching share tokens — no dangling
-- public links pointing at content that no longer exists.

ALTER TABLE share_tokens
    ALTER COLUMN report_id DROP NOT NULL,
    ADD COLUMN example_id UUID REFERENCES examples(id) ON DELETE CASCADE,
    ADD CONSTRAINT share_tokens_source_xor
        CHECK ((report_id IS NULL) <> (example_id IS NULL));

-- Matches the report_id index for symmetric lookup performance.
CREATE INDEX idx_share_tokens_example_id ON share_tokens(example_id);
