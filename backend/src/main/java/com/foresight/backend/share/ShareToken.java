package com.foresight.backend.share;

import java.time.Instant;
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
 * Public, immutable snapshot of either a {@link com.foresight.backend.report.Report} or
 * a {@link com.foresight.backend.example.Example}, letting the originator share a
 * read-only view with a third party without requiring them to log in.
 *
 * <p>Exactly ONE of {@link #reportId} / {@link #exampleId} is non-null — enforced by a
 * CHECK constraint at the DB level (see {@code V9__share_tokens_for_examples.sql}). The
 * source kind isn't stored explicitly; consumers infer it from whichever column is set.
 *
 * <p>The snapshot is frozen at creation time: even if the original source is later edited
 * or deleted, the recipient keeps seeing exactly what was generated when the share link
 * was minted. We copy the title, inputData and resultData as JSONB so the public read path
 * can serve the page without touching {@code reports} or {@code examples} at all.
 *
 * <p>Tokens expire after a fixed window (defaults to 7 days). The cleanup of expired rows
 * is intentionally lazy — the public endpoint just returns 404 when {@code expiresAt} is
 * in the past. A scheduled purge job can be added later if storage becomes a concern.
 */
@Entity
@Table(name = "share_tokens")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ShareToken extends BaseEntity {

    /** URL-safe random string used as the public identifier in {@code /share/{token}}. */
    @Column(nullable = false, unique = true, length = 64)
    private String token;

    /** UUID of the originating {@link com.foresight.backend.report.Report}, or
     *  {@code null} when the share was minted from an example (see
     *  {@link #exampleId}). Exactly one of {@code reportId} / {@code exampleId}
     *  is populated — enforced by a DB-level CHECK. */
    @Column(name = "report_id")
    private UUID reportId;

    /** UUID of the originating {@link com.foresight.backend.example.Example},
     *  or {@code null} when the share was minted from a regular report. */
    @Column(name = "example_id")
    private UUID exampleId;

    /** UUID of the {@link com.foresight.backend.user.User} who minted this share. */
    @Column(name = "user_id", nullable = false)
    private UUID userId;

    /** Title at the moment of sharing — kept frozen even if the source report is renamed. */
    @Column(nullable = false, length = 500)
    private String title;

    /** Snapshot of the report's {@code inputData} as it stood at sharing time. */
    @Type(JsonBinaryType.class)
    @Column(name = "input_data", nullable = false, columnDefinition = "jsonb")
    private JsonNode inputData;

    /** Snapshot of the report's {@code resultData}. May be {@code null} if the source report
     *  had no analysis yet, though in practice the UI only enables sharing after analysis. */
    @Type(JsonBinaryType.class)
    @Column(name = "result_data", columnDefinition = "jsonb")
    private JsonNode resultData;

    /** ISO-639-1 of the language stored in {@link #inputData} / {@link #resultData}.
     *  Defaults to {@code "es"} at the DB level so pre-V10 rows still resolve cleanly. */
    @Column(name = "primary_language", nullable = false, length = 8)
    @Builder.Default
    private String primaryLanguage = "es";

    /** Map of cached translations frozen at share creation time. Mirrors
     *  {@code reports.translations}: keyed by ISO-639-1 code, each value carries
     *  {@code inputData}, {@code resultData}, {@code generatedAt}. The entry whose
     *  key matches {@link #primaryLanguage} is generally absent — that one lives
     *  in the columns above. {@code null} for shares minted before V10. */
    @Type(JsonBinaryType.class)
    @Column(name = "translations", columnDefinition = "jsonb")
    private JsonNode translations;

    /** Hard expiry timestamp. Once {@code now() > expiresAt} the public endpoint returns 404. */
    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;
}
