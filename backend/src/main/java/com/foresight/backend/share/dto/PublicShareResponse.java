package com.foresight.backend.share.dto;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;

import com.fasterxml.jackson.databind.JsonNode;
import com.foresight.backend.share.ShareToken;

/**
 * Read-only projection served on the public {@code /api/public/share/{token}} endpoint.
 *
 * <p>Deliberately does <strong>not</strong> include the original {@code reportId} or any
 * owner identifier — third-party recipients only need to see the report content, never
 * who created it or which internal id it maps to.
 *
 * <p>Multi-lingual shares carry the chosen primary language's payload in
 * {@code inputData} / {@code resultData} (matching the legacy single-language shape) PLUS
 * a {@code translations} map keyed by ISO-639-1 code for every other cached translation
 * the share was frozen with. The {@code availableLanguages} list is the union — primary
 * plus every key in {@code translations} — so the frontend can render a language
 * switcher without parsing the translations map itself.
 *
 * <p>Pre-V10 shares come back with {@code primaryLanguage='es'} (the DB default) and
 * {@code translations=null}, which the frontend treats as a single-language share — no
 * switcher rendered.
 */
public record PublicShareResponse(
        String title,
        String primaryLanguage,
        List<String> availableLanguages,
        JsonNode inputData,
        JsonNode resultData,
        JsonNode translations,
        Instant createdAt,
        Instant expiresAt) {

    public static PublicShareResponse from(ShareToken share) {
        return new PublicShareResponse(
                share.getTitle(),
                share.getPrimaryLanguage(),
                buildAvailableLanguages(share),
                share.getInputData(),
                share.getResultData(),
                share.getTranslations(),
                share.getCreatedAt(),
                share.getExpiresAt());
    }

    /**
     * Union of {@code primaryLanguage} and every top-level key in
     * {@code translations}. Primary always comes first so the recipient
     * sees the "authored" pill on the left of the switcher.
     */
    private static List<String> buildAvailableLanguages(ShareToken share) {
        List<String> langs = new ArrayList<>();
        langs.add(share.getPrimaryLanguage());
        JsonNode translations = share.getTranslations();
        if (translations != null && translations.isObject()) {
            Iterator<String> it = translations.fieldNames();
            while (it.hasNext()) {
                String k = it.next();
                if (!langs.contains(k)) langs.add(k);
            }
        }
        return langs;
    }
}
