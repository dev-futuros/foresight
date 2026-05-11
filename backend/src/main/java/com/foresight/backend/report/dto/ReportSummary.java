package com.foresight.backend.report.dto;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.UUID;

import com.fasterxml.jackson.databind.JsonNode;
import com.foresight.backend.report.Report;
import com.foresight.backend.report.ReportStatus;

/**
 * Lightweight projection of a {@link Report} used in list endpoints.
 *
 * <p>Intentionally omits the potentially-huge {@code inputData} and {@code resultData} JSON
 * blobs — the dashboard only needs the metadata.
 *
 * <p>{@code primaryLanguage} + {@code availableLanguages} are surfaced here too so the
 * dashboard cards can render the per-report translation chips (and disable share/export
 * languages that aren't materialised yet) without having to fetch each report's full
 * detail row.
 *
 * @param id                  report UUID
 * @param title               human-readable title
 * @param status              current lifecycle status
 * @param primaryLanguage     ISO-639-1 code identifying the wizard's language
 *                            ({@code "es"} or {@code "en"})
 * @param availableLanguages  languages this report is available in — always includes
 *                            {@link #primaryLanguage}, plus any languages with a cached
 *                            translation row
 * @param createdAt           creation timestamp
 * @param updatedAt           last-modification timestamp
 */
public record ReportSummary(
        UUID id,
        String title,
        ReportStatus status,
        String primaryLanguage,
        List<String> availableLanguages,
        Instant createdAt,
        Instant updatedAt) {
    /**
     * Maps an entity into the list summary projection.
     *
     * @param r source entity
     * @return populated summary
     */
    public static ReportSummary from(Report r) {
        return new ReportSummary(
                r.getId(),
                r.getTitle(),
                r.getStatus(),
                r.getPrimaryLanguage(),
                resolveAvailableLanguages(r),
                r.getCreatedAt(),
                r.getUpdatedAt());
    }

    private static List<String> resolveAvailableLanguages(Report r) {
        List<String> langs = new ArrayList<>();
        String primary = r.getPrimaryLanguage();
        if (primary != null) langs.add(primary);
        JsonNode translations = r.getTranslations();
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
