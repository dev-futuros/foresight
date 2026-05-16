package com.foresight.backend.report;

import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
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
 * JPA entity representing a strategic foresight report owned by a single user.
 *
 * <p>Both the user-supplied inputs (company profile, STEEP factors, horizon signals) and the
 * AI-generated output are stored as PostgreSQL {@code JSONB} columns via {@code JsonBinaryType}.
 * This gives us schema flexibility — the input/output shape can evolve without a migration —
 * while still letting PostgreSQL index and query fields inside the JSON if needed later.
 *
 * <p>Ownership is enforced by a plain {@code user_id} column and checked at query time in
 * {@link ReportService} to keep cross-user leaks impossible at the data layer.
 */
@Entity
@Table(name = "reports")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Report extends BaseEntity {

    /** UUID of the {@link com.foresight.backend.user.User} who owns this report. */
    @Column(name = "user_id", nullable = false)
    private UUID userId;

    /** Human-readable title (shown in the dashboard list). */
    @Column(nullable = false, length = 500)
    private String title;

    /** Current lifecycle status. See {@link ReportStatus}. */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ReportStatus status;

    /**
     * User-provided inputs as a JSONB document: typically {@code companyProfile},
     * {@code steep}, and {@code horizon} sub-objects.
     */
    @Type(JsonBinaryType.class)
    @Column(name = "input_data", nullable = false, columnDefinition = "jsonb")
    private JsonNode inputData;

    /**
     * AI-generated report body as a JSONB document. {@code null} until analysis completes.
     */
    @Type(JsonBinaryType.class)
    @Column(name = "result_data", columnDefinition = "jsonb")
    private JsonNode resultData;

    /**
     * Language the wizard used to generate this report. New reports default to
     * {@code "es"}; the wizard sets it explicitly to {@code "en"} when run in
     * English. The on-demand translation cache below keys other languages off
     * of this one — the primary language's entry is generally absent from
     * {@link #translations} since the original {@link #inputData} /
     * {@link #resultData} columns hold it.
     */
    @Column(name = "primary_language", nullable = false, length = 8)
    @Builder.Default
    private String primaryLanguage = "es";

    /**
     * Optional per-language cache of translated report copies. Shape:
     * <pre>
     * {
     *   "en": {
     *     "inputData":   { ... same shape as the primary inputData ... },
     *     "resultData":  { ... same shape as the primary resultData ... },
     *     "generatedAt": "2026-05-11T12:34:56Z"
     *   },
     *   "es": { ... }
     * }
     * </pre>
     *
     * Populated lazily by {@code ReportService.translate} when the user
     * picks a non-primary language in the share or export dialog. Reused
     * verbatim on every subsequent share/export in that language.
     */
    @Type(JsonBinaryType.class)
    @Column(name = "translations", columnDefinition = "jsonb")
    private JsonNode translations;

    /**
     * PDF-export "tighten" cache. Populated by the export pipeline when it asks the
     * {@code /api/ai/tighten} endpoint to shorten report prose so it fits a specific
     * magazine-style layout budget. Shape:
     * <pre>
     * {
     *   "en": {
     *     "version": 1,
     *     "generatedAt": "ISO-8601",
     *     "fields": {
     *       "executiveSummary":         "...",
     *       "steep.global.S":           "...",
     *       "scenarios.0.description":  "...",
     *       "scenarios.0.firstMove":    "..."
     *     }
     *   },
     *   "es": { ... }
     * }
     * </pre>
     *
     * <p>Field paths are dotted and mirror the {@link #resultData} / {@link #inputData}
     * JSON structure (array indices appear as integers). Entries are simple strings — no
     * structural rewrites, just shorter prose. Stale when the source text changes; we
     * accept that for v1 rather than tracking content hashes.
     */
    @Type(JsonBinaryType.class)
    @Column(name = "pdf_optimized", columnDefinition = "jsonb")
    private JsonNode pdfOptimized;
}
