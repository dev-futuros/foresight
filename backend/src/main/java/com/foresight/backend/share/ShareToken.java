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
 * Public, immutable snapshot of a {@link com.foresight.backend.report.Report} that lets
 * the owner share a read-only view of the analysis with a third party (typically the end
 * client) without requiring them to log in.
 *
 * <p>The snapshot is frozen at creation time: even if the original report is later edited
 * or deleted, the recipient keeps seeing exactly what was generated when the share link
 * was minted. We copy the title, inputData and resultData as JSONB so the public read path
 * can serve the page without touching the {@code reports} table at all.
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

    /** UUID of the originating {@link com.foresight.backend.report.Report}. */
    @Column(name = "report_id", nullable = false)
    private UUID reportId;

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

    /** Hard expiry timestamp. Once {@code now() > expiresAt} the public endpoint returns 404. */
    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;
}
