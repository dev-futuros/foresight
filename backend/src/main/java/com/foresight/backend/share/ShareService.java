package com.foresight.backend.share;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.databind.JsonNode;
import com.foresight.backend.common.exception.NotFoundException;
import com.foresight.backend.report.Report;
import com.foresight.backend.report.ReportService;

import lombok.RequiredArgsConstructor;

/**
 * Mints and resolves public share tokens for foresight reports.
 *
 * <p>Sharing happens in two steps:
 *
 * <ol>
 *   <li>The owner calls {@link #createForReport(UUID, UUID)} which freezes a snapshot of the
 *       report's title, inputs and results into a new {@link ShareToken} row, valid for
 *       {@link #SHARE_TTL}.</li>
 *   <li>Anyone with the token URL calls {@link #findValidByToken(String)} which checks the
 *       expiry and returns the snapshot — without ever loading the live {@link Report} row,
 *       so subsequent edits or deletes on the original do not leak into the public view.</li>
 * </ol>
 */
@Service
@RequiredArgsConstructor
public class ShareService {

    /** How long a freshly minted share remains accessible. 7 days, matching the demo's
     *  "Este enlace expira en 7 días" copy. */
    private static final Duration SHARE_TTL = Duration.ofDays(7);

    /** 32 bytes of randomness, base64url-encoded → 43 chars. Long enough that brute-force
     *  enumeration is not a concern. */
    private static final int TOKEN_BYTES = 32;

    private final ShareTokenRepository repository;
    private final ReportService reportService;
    private final SecureRandom random = new SecureRandom();

    @Value("${app.frontend-url:http://localhost:5173}")
    private String frontendUrl;

    /**
     * Mints a fresh share token for a report the caller owns. Each call creates a brand
     * new token — re-sharing the same report just produces another row, leaving any
     * previously distributed links alone.
     *
     * <p>When {@code language} is non-null and differs from the report's
     * primary language, the share is frozen with the translated copy
     * instead of the original. Translation is materialised via
     * {@link ReportService#translate} (which caches per report × language)
     * so re-sharing the same translated copy is essentially free.
     *
     * @param reportId report to share
     * @param ownerId  caller; must own the report
     * @param language ISO-639-1 code for the share language ({@code "es"} or
     *                 {@code "en"}). When {@code null}, defaults to the
     *                 report's primary language
     * @return persisted share with the new token already populated
     * @throws NotFoundException if the report does not exist or belongs to another user
     */
    @Transactional
    public ShareToken createForReport(UUID reportId, UUID ownerId, String language) {
        // ReportService throws NotFoundException when ownership doesn't match — that's
        // the only path the controller needs to translate into a 404 for the caller.
        Report report = reportService.getOwned(reportId, ownerId);
        String targetLang = (language == null || language.isBlank())
                ? report.getPrimaryLanguage()
                : language;

        JsonNode snapshotInput = report.getInputData();
        JsonNode snapshotResult = report.getResultData();
        if (!targetLang.equals(report.getPrimaryLanguage())) {
            // Pull (or materialise) the cached translation for this language.
            JsonNode translated = reportService.translate(reportId, ownerId, targetLang, false);
            if (translated != null && translated.isObject()) {
                if (translated.has("inputData")) snapshotInput = translated.get("inputData");
                if (translated.has("resultData")) snapshotResult = translated.get("resultData");
            }
        }

        ShareToken share = ShareToken.builder()
                .token(generateToken())
                .reportId(report.getId())
                .userId(ownerId)
                .title(report.getTitle())
                .inputData(snapshotInput)
                .resultData(snapshotResult)
                .expiresAt(Instant.now().plus(SHARE_TTL))
                .build();
        return repository.save(share);
    }

    /**
     * Backwards-compatible overload — shares in the report's primary
     * language. Existing callers that don't care about translation
     * don't have to change.
     */
    @Transactional
    public ShareToken createForReport(UUID reportId, UUID ownerId) {
        return createForReport(reportId, ownerId, null);
    }

    /**
     * Resolves a public token to its frozen snapshot, enforcing expiry.
     *
     * @param token raw token from the URL
     * @return the share row, guaranteed not yet expired
     * @throws NotFoundException if the token is unknown OR has expired (we deliberately
     *         conflate the two so callers cannot probe whether a token ever existed)
     */
    @Transactional(readOnly = true)
    public ShareToken findValidByToken(String token) {
        return repository
                .findByToken(token)
                .filter(s -> s.getExpiresAt().isAfter(Instant.now()))
                .orElseThrow(() -> new NotFoundException("Share not found or expired"));
    }

    /** Public origin (e.g. {@code https://app.futuros.io}) used to build the share URL. */
    public String publicBaseUrl() {
        return frontendUrl;
    }

    private String generateToken() {
        byte[] buf = new byte[TOKEN_BYTES];
        random.nextBytes(buf);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(buf);
    }
}
