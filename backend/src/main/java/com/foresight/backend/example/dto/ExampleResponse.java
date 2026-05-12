package com.foresight.backend.example.dto;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.UUID;

import com.fasterxml.jackson.databind.JsonNode;
import com.foresight.backend.example.Example;

/**
 * Full projection of an {@link Example} for the detail / read endpoint.
 *
 * <p>Mirrors {@link com.foresight.backend.report.dto.ReportResponse} so the
 * report viewer can render an example with the same component as a real
 * report — every consumed field has the same name and type.
 */
public record ExampleResponse(
        UUID id,
        String slug,
        String title,
        String description,
        String primaryLanguage,
        List<String> availableLanguages,
        JsonNode inputData,
        JsonNode resultData,
        Instant createdAt,
        Instant updatedAt) {

    public static ExampleResponse from(Example e) {
        return new ExampleResponse(
                e.getId(),
                e.getSlug(),
                e.getTitle(),
                e.getDescription(),
                e.getPrimaryLanguage(),
                resolveAvailableLanguages(e),
                e.getInputData(),
                e.getResultData(),
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
