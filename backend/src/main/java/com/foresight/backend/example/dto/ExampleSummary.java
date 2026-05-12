package com.foresight.backend.example.dto;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.UUID;

import com.fasterxml.jackson.databind.JsonNode;
import com.foresight.backend.example.Example;

/**
 * Lightweight projection of an {@link Example} for the dashboard list.
 *
 * <p>Mirrors {@link com.foresight.backend.report.dto.ReportSummary} so the
 * frontend's card renderer can treat reports and examples uniformly —
 * status is hard-coded {@code "COMPLETED"} because the Promote flow only
 * accepts source reports that already have a {@code resultData}.
 *
 * @param id                 example UUID (real DB id, distinct from user reports)
 * @param slug               stable kebab-case identifier (also used in URLs)
 * @param title              display title
 * @param description        optional one-liner
 * @param primaryLanguage    ISO-639-1 code identifying the snapshotted body's language
 * @param availableLanguages list of languages the example is available in (primary + any translations)
 * @param createdAt          promotion timestamp
 * @param updatedAt          last-promotion timestamp
 */
public record ExampleSummary(
        UUID id,
        String slug,
        String title,
        String description,
        String primaryLanguage,
        List<String> availableLanguages,
        Instant createdAt,
        Instant updatedAt) {

    public static ExampleSummary from(Example e) {
        return new ExampleSummary(
                e.getId(),
                e.getSlug(),
                e.getTitle(),
                e.getDescription(),
                e.getPrimaryLanguage(),
                resolveAvailableLanguages(e),
                e.getCreatedAt(),
                e.getUpdatedAt());
    }

    private static List<String> resolveAvailableLanguages(Example e) {
        List<String> langs = new ArrayList<>();
        String primary = e.getPrimaryLanguage();
        if (primary != null) langs.add(primary);
        JsonNode translations = e.getTranslations();
        if (translations != null && translations.isObject()) {
            Iterator<String> it = translations.fieldNames();
            while (it.hasNext()) {
                String lang = it.next();
                if (!langs.contains(lang)) langs.add(lang);
            }
        }
        return langs;
    }
}
