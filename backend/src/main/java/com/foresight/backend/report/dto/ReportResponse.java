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
 * Full projection of a {@link Report} used for detail views.
 *
 * <p>Includes both {@code inputData} and {@code resultData} — can be large. For list views, use
 * {@link ReportSummary} instead.
 *
 * @param id                    report UUID
 * @param title                 human-readable title
 * @param status                current lifecycle status
 * @param inputData             JSON inputs provided by the user (primary language)
 * @param resultData            JSON output produced by the AI (primary language; may be {@code null})
 * @param primaryLanguage       ISO-639-1 code identifying the language the wizard used
 *                              ({@code "es"} or {@code "en"})
 * @param availableLanguages    languages this report is available in — always includes
 *                              {@link #primaryLanguage}, plus any languages with a cached
 *                              translation row. The frontend's share / export dialogs use
 *                              this to decide whether picking a language triggers a translate
 *                              call or returns instantly
 * @param pdfOptimized          per-language cache of "tightened" prose used by the PDF export
 *                              pipeline. Shape per language entry:
 *                              {@code {version, generatedAt, fields: {<dotted-path>: <text>}}}.
 *                              {@code null} when no PDF has been exported yet for this report
 * @param createdAt             creation timestamp
 * @param updatedAt             last-modification timestamp
 */
public record ReportResponse(
        UUID id,
        String title,
        ReportStatus status,
        JsonNode inputData,
        JsonNode resultData,
        String primaryLanguage,
        List<String> availableLanguages,
        JsonNode pdfOptimized,
        Instant createdAt,
        Instant updatedAt) {
    /**
     * Maps an entity into the full response projection. The
     * {@code availableLanguages} list is derived from the entity's
     * {@code primaryLanguage} plus the keys of any cached
     * {@code translations}.
     *
     * @param r source entity
     * @return populated response
     */
    public static ReportResponse from(Report r) {
        return new ReportResponse(
                r.getId(),
                r.getTitle(),
                r.getStatus(),
                r.getInputData(),
                r.getResultData(),
                r.getPrimaryLanguage(),
                resolveAvailableLanguages(r),
                r.getPdfOptimized(),
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
