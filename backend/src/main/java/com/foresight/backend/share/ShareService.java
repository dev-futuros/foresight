package com.foresight.backend.share;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.foresight.backend.common.exception.NotFoundException;
import com.foresight.backend.example.Example;
import com.foresight.backend.example.ExampleService;
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
    private final ExampleService exampleService;
    private final ObjectMapper objectMapper;
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
    public ShareToken createForReport(
            UUID reportId,
            UUID ownerId,
            String language,
            Collection<String> includeLanguages) {
        // ReportService throws NotFoundException when ownership doesn't match — that's
        // the only path the controller needs to translate into a 404 for the caller.
        Report report = reportService.getOwned(reportId, ownerId);
        String targetLang = (language == null || language.isBlank())
                ? report.getPrimaryLanguage()
                : language;

        // The share's primary payload — fetched (or pulled from cache)
        // via reportService.translate when targetLang differs from the
        // source's primary.
        JsonNode snapshotInput = report.getInputData();
        JsonNode snapshotResult = report.getResultData();
        if (!targetLang.equals(report.getPrimaryLanguage())) {
            JsonNode translated = reportService.translate(reportId, ownerId, targetLang, false);
            if (translated != null && translated.isObject()) {
                if (translated.has("inputData")) snapshotInput = translated.get("inputData");
                if (translated.has("resultData")) snapshotResult = translated.get("resultData");
            }
        }

        // Resolve the FULL set of languages to bake into the snapshot.
        // The caller may have nominated a specific subset via
        // {@code includeLanguages}; if not (null/empty) we default to
        // "every language the report has cached" so the recipient gets
        // a complete viewer experience.
        Set<String> include = resolveIncludeSet(
                includeLanguages,
                report.getPrimaryLanguage(),
                report.getTranslations(),
                targetLang);
        JsonNode snapshotTranslations = materialiseTranslations(
                include,
                targetLang,
                report.getPrimaryLanguage(),
                report.getInputData(),
                report.getResultData(),
                (lang) -> reportService.translate(reportId, ownerId, lang, false));

        ShareToken share = ShareToken.builder()
                .token(generateToken())
                .reportId(report.getId())
                .userId(ownerId)
                .title(report.getTitle())
                .inputData(snapshotInput)
                .resultData(snapshotResult)
                .primaryLanguage(targetLang)
                .translations(snapshotTranslations)
                .expiresAt(Instant.now().plus(SHARE_TTL))
                .build();
        return repository.save(share);
    }

    /**
     * Backwards-compatible overloads. Existing callers that don't need
     * the new {@code includeLanguages} control don't have to change.
     */
    @Transactional
    public ShareToken createForReport(UUID reportId, UUID ownerId, String language) {
        return createForReport(reportId, ownerId, language, null);
    }

    @Transactional
    public ShareToken createForReport(UUID reportId, UUID ownerId) {
        return createForReport(reportId, ownerId, null, null);
    }

    /**
     * Mints a fresh share token for an example. Open to any authenticated
     * user — examples are global, read-only content. The {@code callerRole}
     * is forwarded to {@link ExampleService#translate} only so a cache-miss
     * on a non-primary language doesn't accidentally let a non-DEV trigger
     * a paid translation; the share itself doesn't require DEV.
     *
     * @param exampleId  example to share
     * @param userId     caller (recorded as the share's {@code userId})
     * @param callerRole caller's role string — used by the translate cache
     *                   check; non-DEV callers asking for a not-yet-translated
     *                   language will surface as a 403 instead of triggering
     *                   the AI round-trip
     * @param language   ISO-639-1 code, or {@code null} for the example's
     *                   primary language
     */
    @Transactional
    public ShareToken createForExample(
            UUID exampleId,
            UUID userId,
            String callerRole,
            String language,
            Collection<String> includeLanguages) {
        Example example = exampleService.get(exampleId);
        String targetLang = (language == null || language.isBlank())
                ? example.getPrimaryLanguage()
                : language;

        JsonNode snapshotInput = example.getInputData();
        JsonNode snapshotResult = example.getResultData();
        if (!targetLang.equals(example.getPrimaryLanguage())) {
            JsonNode translated = exampleService.translate(exampleId, callerRole, targetLang, false);
            if (translated != null && translated.isObject()) {
                if (translated.has("inputData")) snapshotInput = translated.get("inputData");
                if (translated.has("resultData")) snapshotResult = translated.get("resultData");
            }
        }

        // Same multi-language snapshot logic as report shares — see
        // {@link #createForReport} for the rationale.
        Set<String> include = resolveIncludeSet(
                includeLanguages,
                example.getPrimaryLanguage(),
                example.getTranslations(),
                targetLang);
        JsonNode snapshotTranslations = materialiseTranslations(
                include,
                targetLang,
                example.getPrimaryLanguage(),
                example.getInputData(),
                example.getResultData(),
                (lang) -> exampleService.translate(exampleId, callerRole, lang, false));

        ShareToken share = ShareToken.builder()
                .token(generateToken())
                .exampleId(example.getId())
                .userId(userId)
                .title(example.getTitle())
                .inputData(snapshotInput)
                .resultData(snapshotResult)
                .primaryLanguage(targetLang)
                .translations(snapshotTranslations)
                .expiresAt(Instant.now().plus(SHARE_TTL))
                .build();
        return repository.save(share);
    }

    /** Backwards-compatible overload. */
    @Transactional
    public ShareToken createForExample(UUID exampleId, UUID userId, String callerRole, String language) {
        return createForExample(exampleId, userId, callerRole, language, null);
    }

    /**
     * Functional shim handed to {@link #materialiseTranslations} so it can
     * pull translation payloads without ShareService needing two parallel
     * code paths for reports and examples. Each consumer wires this up
     * to its own service's {@code translate(...)} method.
     */
    @FunctionalInterface
    private interface TranslationLookup {
        JsonNode resolve(String language);
    }

    /**
     * Compute the FULL set of languages the share should include —
     * always contains the share's primary plus whichever extras the
     * caller picked. When {@code requested} is null/empty we fall
     * back to "every language the source has", preserving the older
     * "include all by default" behaviour for callers that don't
     * provide the new filter.
     */
    private Set<String> resolveIncludeSet(
            Collection<String> requested,
            String sourcePrimaryLanguage,
            JsonNode sourceTranslations,
            String shareLanguage) {
        Set<String> out = new LinkedHashSet<>();
        // The share's own primary must always be present — it's what
        // the recipient sees first; you can't share something without
        // its own default-open language.
        out.add(shareLanguage);
        if (requested == null || requested.isEmpty()) {
            // No explicit filter — include everything the source has.
            out.add(sourcePrimaryLanguage);
            if (sourceTranslations != null && sourceTranslations.isObject()) {
                sourceTranslations.fieldNames().forEachRemaining(out::add);
            }
        } else {
            for (String r : requested) {
                if (r != null && !r.isBlank()) out.add(r);
            }
        }
        return out;
    }

    /**
     * Build the snapshot's translations map: one entry per language in
     * {@code include}, except the share's primary (whose payload already
     * lives in the share's {@code inputData}/{@code resultData} columns).
     * Each entry is materialised through {@code lookup} — a single,
     * cache-warm call to the source's translate service.
     *
     * <p>Returns {@code null} when the resulting map is empty (single-
     * language share) so the DB column stays NULL and the public
     * response's {@code availableLanguages} ends up as a single-element
     * list — the frontend hides the switcher pill in that case.
     */
    private JsonNode materialiseTranslations(
            Set<String> include,
            String shareLanguage,
            String sourcePrimaryLanguage,
            JsonNode sourcePrimaryInput,
            JsonNode sourcePrimaryResult,
            TranslationLookup lookup) {
        com.fasterxml.jackson.databind.node.ObjectNode out = objectMapper.createObjectNode();
        for (String lang : include) {
            if (lang.equals(shareLanguage)) continue; // already in the columns
            JsonNode input;
            JsonNode result;
            if (lang.equals(sourcePrimaryLanguage)) {
                input = sourcePrimaryInput;
                result = sourcePrimaryResult;
            } else {
                JsonNode translated = lookup.resolve(lang);
                if (translated == null || !translated.isObject()) continue;
                input = translated.path("inputData");
                if (input.isMissingNode()) input = null;
                result = translated.path("resultData");
                if (result.isMissingNode()) result = null;
            }
            if (input == null && result == null) continue;
            com.fasterxml.jackson.databind.node.ObjectNode entry = objectMapper.createObjectNode();
            if (input != null) entry.set("inputData", input);
            if (result != null) entry.set("resultData", result);
            entry.put("generatedAt", Instant.now().toString());
            out.set(lang, entry);
        }
        return out.size() == 0 ? null : out;
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
