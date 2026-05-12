package com.foresight.backend.example;

import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import org.hibernate.annotations.Type;

import com.fasterxml.jackson.databind.JsonNode;
import com.foresight.backend.common.domain.BaseEntity;

import io.hypersistence.utils.hibernate.type.json.JsonBinaryType;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Demonstration reports surfaced to every user on the dashboard. Promoted
 * from a real {@link com.foresight.backend.report.Report} by a {@code DEV}
 * user via the promote endpoint — the report's content is snapshotted into
 * a new {@code Example} row, leaving the source report unchanged.
 *
 * <p>Examples are read-only for everyone except {@code DEV} users.
 * Translations live on the example row itself, so any translation a DEV
 * generates is immediately visible to every other user without a per-user
 * Anthropic round-trip.
 *
 * <p>{@link #createdByUserId} is audit-only — examples are not "owned" by
 * any user, every DEV can edit any example.
 */
@Entity
@Table(name = "examples")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Example extends BaseEntity {

    /**
     * Stable, kebab-case identifier supplied by the dev in the Promote
     * modal. Unique across the table and used as the natural upsert key
     * for re-promotions — running "Promote" again with the same slug
     * overwrites the existing example with the new snapshot.
     */
    @Column(nullable = false, unique = true, length = 120)
    private String slug;

    /** Display title — shown on the dashboard card and the report header. */
    @Column(nullable = false, length = 500)
    private String title;

    /** Optional one-liner shown on hover / under the title. */
    @Column(columnDefinition = "text")
    private String description;

    /**
     * Language the snapshotted {@link #inputData}/{@link #resultData} are
     * written in. Translations to other languages live in
     * {@link #translations}, keyed by ISO-639-1 code.
     */
    @Column(name = "primary_language", nullable = false, length = 8)
    @Builder.Default
    private String primaryLanguage = "es";

    /**
     * Full wizard inputs (companyProfile + globalSteep + steep + horizon).
     * Same shape as {@code reports.input_data} so the report renderer
     * accepts it without branching.
     */
    @Type(JsonBinaryType.class)
    @Column(name = "input_data", nullable = false, columnDefinition = "jsonb")
    private JsonNode inputData;

    /**
     * Full analysis output. The Promote flow rejects reports that haven't
     * generated their analysis yet, so this is non-null in practice; the
     * column is nullable only for symmetry with {@code reports.result_data}.
     */
    @Type(JsonBinaryType.class)
    @Column(name = "result_data", columnDefinition = "jsonb")
    private JsonNode resultData;

    /**
     * Per-language cache of translated example copies. Same shape as the
     * per-report translations cache:
     * <pre>
     * {
     *   "en": {"inputData": ..., "resultData": ..., "generatedAt": "..."},
     *   "es": {...}
     * }
     * </pre>
     * The entry for {@link #primaryLanguage} is generally absent (the
     * primary copy lives in the inputData / resultData columns).
     */
    @Type(JsonBinaryType.class)
    @Column(columnDefinition = "jsonb")
    private JsonNode translations;

    /** The DEV user who promoted (or last overwrote) this example. */
    @Column(name = "created_by_user_id", nullable = false)
    private UUID createdByUserId;
}
