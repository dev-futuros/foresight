package com.foresight.backend.example;

import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.foresight.backend.ai.AiService;
import com.foresight.backend.common.exception.BadRequestException;
import com.foresight.backend.common.exception.ConflictException;
import com.foresight.backend.common.exception.ForbiddenException;
import com.foresight.backend.common.exception.NotFoundException;
import com.foresight.backend.example.dto.PromoteToExampleRequest;
import com.foresight.backend.report.Report;
import com.foresight.backend.report.ReportRepository;
import com.foresight.backend.report.ReportStatus;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

/**
 * Business logic for {@link Example} CRUD and translation.
 *
 * <p>Examples are global content: list / read endpoints are open to every
 * authenticated user, but every write operation (promote, delete, translate,
 * delete-translation) requires the caller to carry the {@code DEV} role.
 * The role check is encapsulated in {@link #requireDev} so every entry point
 * fails the same way (HTTP 403 with a consistent message).
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class ExampleService {

    /** Languages currently accepted by the on-demand translator. */
    private static final Set<String> SUPPORTED_LANGUAGES = Set.of("es", "en", "ca");

    private final ExampleRepository exampleRepository;
    private final ReportRepository reportRepository;
    private final AiService aiService;
    private final ObjectMapper objectMapper;
    private final TransactionTemplate transactionTemplate;

    // ────────────────────────────────────────────────────────────────
    // Reads (open to any authenticated user)
    // ────────────────────────────────────────────────────────────────

    /** All examples, newest first. */
    @Transactional(readOnly = true)
    public List<Example> list() {
        return exampleRepository.findAllByOrderByCreatedAtDesc();
    }

    /** Look up one example by id. */
    @Transactional(readOnly = true)
    public Example get(UUID id) {
        return exampleRepository
                .findById(id)
                .orElseThrow(() -> new NotFoundException("Example not found"));
    }

    /** Look up one example by slug (used by the public share path). */
    @Transactional(readOnly = true)
    public Example getBySlug(String slug) {
        return exampleRepository
                .findBySlug(slug)
                .orElseThrow(() -> new NotFoundException("Example not found"));
    }

    // ────────────────────────────────────────────────────────────────
    // DEV-only mutations
    // ────────────────────────────────────────────────────────────────

    /**
     * Promote a report owned by the calling DEV into an example. This
     * is a CONVERSION, not a copy — the source report is deleted as part
     * of the operation, so the row count stays balanced.
     *
     * <p>Two paths depending on whether the slug already exists:
     * <ul>
     *   <li><b>First-time promote</b> (slug is new): the new example
     *       inherits the source report's UUID, so any URL or bookmark
     *       like {@code /reports/<id>} keeps working after the conversion.
     *       Translations on the source report carry over verbatim.</li>
     *   <li><b>Re-promote</b> (slug already in use): the existing example
     *       is updated in place with the new content, keeping its own
     *       UUID. Old translations are dropped because the underlying
     *       content is changing. The source report is still deleted —
     *       its UUID becomes orphaned.</li>
     * </ul>
     *
     * <p>Share tokens pointing at the source report cascade-delete along
     * with it. The caller can re-share once the example is in place.
     *
     * @param reportId  source report (must be owned by the caller, completed)
     * @param callerId  authenticated DEV user
     * @param request   validated payload — slug required; title /
     *                  description optional overrides
     * @return the persisted example
     */
    @Transactional
    public Example promoteReport(UUID reportId, UUID callerId, String callerRole, PromoteToExampleRequest request) {
        requireDev(callerRole);
        Report source = reportRepository
                .findByIdAndUserId(reportId, callerId)
                .orElseThrow(() -> new NotFoundException("Report not found"));
        if (source.getResultData() == null || source.getStatus() != ReportStatus.COMPLETED) {
            throw new BadRequestException(
                    "Only completed reports with a generated analysis can be promoted");
        }
        String slug = request.slug();
        Example existing = exampleRepository.findBySlug(slug).orElse(null);
        // First-time promote: the new example inherits the source
        // report's UUID for URL stability. Re-promote: keep the
        // existing example's UUID, overwrite its content.
        boolean firstTime = (existing == null);
        Example target;
        if (firstTime) {
            // Lombok @Builder doesn't include the inherited id field from
            // BaseEntity, so we build the new Example normally (BaseEntity's
            // ctor pre-populates a fresh UUID) and then overwrite the id
            // with the source report's UUID so the conversion preserves
            // the URL.
            target = Example.builder().slug(slug).build();
            target.setId(source.getId());
        } else {
            target = existing;
        }

        String title = (request.title() != null && !request.title().isBlank())
                ? request.title()
                : source.getTitle();
        target.setTitle(title);
        target.setDescription(request.description());
        target.setPrimaryLanguage(source.getPrimaryLanguage());
        target.setInputData(source.getInputData());
        target.setResultData(source.getResultData());
        // First-time: translations carry over (same content, just moving
        // tables). Re-promote: drop them because they belong to the OLD
        // content that the existing example was holding.
        target.setTranslations(firstTime ? source.getTranslations() : null);
        target.setCreatedByUserId(callerId);

        // Delete the source report BEFORE the example INSERT when
        // they'd share an id — otherwise Hibernate's flush ordering
        // (inserts before deletes) would briefly try to hold two PKs
        // pointing at the same UUID across tables. JPA tolerates it
        // (separate tables), but doing it explicitly is clearer and
        // also frees share-tokens via the ON DELETE CASCADE on
        // share_tokens.report_id.
        reportRepository.delete(source);
        reportRepository.flush();

        try {
            return exampleRepository.save(target);
        } catch (org.springframework.dao.DataIntegrityViolationException e) {
            // Defensive — the slug UNIQUE constraint should be satisfied
            // by the upsert-or-insert branch above, but surface cleanly
            // if a race ever introduces a duplicate.
            throw new ConflictException("An example with this slug already exists");
        }
    }

    /** Hard-delete an example. DEV-only. Idempotent — missing rows are
     *  treated as already-deleted and surface as a 404. */
    @Transactional
    public void delete(UUID id, String callerRole) {
        requireDev(callerRole);
        Example example = get(id);
        exampleRepository.delete(example);
    }

    /**
     * Demote an example back to a private report owned by the calling
     * DEV. CONVERSION: the example row is deleted and a new report row
     * is created with the SAME UUID, so any URL or bookmark pointing at
     * the example keeps working (it now resolves to the report).
     *
     * <p>The example's content (input / result / primary language /
     * translations) moves over verbatim. Share tokens pointing at the
     * example cascade away with the delete — the dev re-shares once
     * the report is in place if they need a fresh link.
     *
     * @return the id of the new report (same as the source example's id)
     */
    @Transactional
    public UUID demoteToReport(UUID id, UUID callerId, String callerRole) {
        requireDev(callerRole);
        Example example = get(id);

        // Snapshot before delete so we don't read from a detached entity.
        UUID preservedId = example.getId();
        String title = example.getTitle();
        JsonNode inputData = example.getInputData();
        JsonNode resultData = example.getResultData();
        String primaryLanguage = example.getPrimaryLanguage();
        JsonNode translations = example.getTranslations();

        // Delete the example first so its row (and any share tokens
        // CASCADE-pointed at it) is gone before we INSERT the report
        // with the same UUID. Different tables so the conversion is
        // safe either way, but explicit ordering keeps Hibernate's
        // flush behaviour predictable.
        exampleRepository.delete(example);
        exampleRepository.flush();

        Report report = Report.builder()
                .userId(callerId)
                .title(title)
                .status(ReportStatus.COMPLETED)
                .inputData(inputData)
                .resultData(resultData)
                .primaryLanguage(primaryLanguage)
                .translations(translations)
                .build();
        // Lombok @Builder doesn't include the inherited id field from
        // BaseEntity — override the auto-generated UUID with the
        // example's preserved id so the conversion keeps the URL stable.
        report.setId(preservedId);
        Report saved = reportRepository.save(report);
        return saved.getId();
    }

    /**
     * Drop a cached translation from an example. DEV-only. Refuses the
     * primary language and silently no-ops on a missing language entry.
     */
    @Transactional
    public void deleteTranslation(UUID id, String callerRole, String language) {
        requireDev(callerRole);
        if (language == null || language.isBlank()) {
            throw new BadRequestException("Language is required");
        }
        Example example = get(id);
        if (language.equals(example.getPrimaryLanguage())) {
            throw new BadRequestException(
                    "Cannot delete the example's primary language (" + language + ")");
        }
        JsonNode translations = example.getTranslations();
        if (translations == null || !translations.isObject() || !translations.has(language)) {
            return;
        }
        ObjectNode next = translations.deepCopy();
        next.remove(language);
        example.setTranslations(next);
        exampleRepository.save(example);
    }

    // ────────────────────────────────────────────────────────────────
    // Translation (DEV-only; streams via SSE)
    // ────────────────────────────────────────────────────────────────

    /**
     * Streaming variant of the translate flow for examples. Mirrors
     * {@code ReportService.translateStream} — emits progress events while
     * the model writes, persists the result on a worker thread before the
     * {@code done} event reaches the client, and short-circuits to a
     * single {@code done} event when the cache is already warm.
     */
    public Flux<JsonNode> translateStream(UUID id, String callerRole, String targetLanguage, boolean force) {
        if (!"DEV".equals(callerRole)) {
            return Flux.error(new ForbiddenException("Only DEV users can translate examples"));
        }
        if (targetLanguage == null || !SUPPORTED_LANGUAGES.contains(targetLanguage)) {
            return Flux.error(new BadRequestException(
                    "Unsupported target language: " + targetLanguage + ". Must be one of " + SUPPORTED_LANGUAGES));
        }

        Example example;
        try {
            example = transactionTemplate.execute(status -> get(id));
        } catch (RuntimeException e) {
            return Flux.error(e);
        }
        if (example == null) return Flux.error(new NotFoundException("Example not found"));

        // Primary language — emit the originals as a single done event.
        if (targetLanguage.equals(example.getPrimaryLanguage())) {
            ObjectNode done = objectMapper.createObjectNode();
            done.put("type", "done");
            if (example.getInputData() != null) done.set("inputData", example.getInputData());
            if (example.getResultData() != null) done.set("resultData", example.getResultData());
            done.put("generatedAt", Instant.now().toString());
            return Flux.just(done);
        }

        // Cache hit — done immediately, no AI call.
        if (!force) {
            JsonNode cached = cachedTranslation(example, targetLanguage);
            if (cached != null && cached.isObject()) {
                ObjectNode done = (ObjectNode) cached.deepCopy();
                done.put("type", "done");
                return Flux.just(done);
            }
        }

        if (example.getResultData() == null) {
            return Flux.error(new BadRequestException(
                    "Example has no analysis to translate"));
        }

        final UUID exampleId = example.getId();
        final JsonNode inputData = example.getInputData();
        final JsonNode resultData = example.getResultData();

        return aiService.translateReportStream(inputData, resultData, targetLanguage)
                .concatMap(evt -> {
                    if (evt == null || !"done".equals(evt.path("type").asText())) {
                        return Mono.just(evt);
                    }
                    // Persist BEFORE the done event reaches the client so
                    // any follow-up fetch sees a warm cache. Same pattern
                    // ReportService.translateStream uses.
                    ObjectNode entry = objectMapper.createObjectNode();
                    if (evt.has("inputData")) entry.set("inputData", evt.get("inputData"));
                    if (evt.has("resultData")) entry.set("resultData", evt.get("resultData"));
                    entry.put("generatedAt", evt.path("generatedAt").asText(Instant.now().toString()));
                    return Mono.fromRunnable(() -> persistTranslation(exampleId, targetLanguage, entry))
                            .subscribeOn(Schedulers.boundedElastic())
                            .then(Mono.just(evt));
                });
    }

    /**
     * Cache-aware non-streaming translate. Used by the share / export flows
     * which only need the final payload. Open to any authenticated user —
     * once a translation has been materialised by a DEV, every reader can
     * fetch the cached copy. Refuses to translate on a cache miss for
     * non-DEV callers (only DEVs can spend AI budget).
     */
    @Transactional
    public JsonNode translate(UUID id, String callerRole, String targetLanguage, boolean force) {
        if (targetLanguage == null || !SUPPORTED_LANGUAGES.contains(targetLanguage)) {
            throw new BadRequestException(
                    "Unsupported target language: " + targetLanguage + ". Must be one of " + SUPPORTED_LANGUAGES);
        }
        Example example = get(id);

        if (targetLanguage.equals(example.getPrimaryLanguage())) {
            ObjectNode envelope = objectMapper.createObjectNode();
            if (example.getInputData() != null) envelope.set("inputData", example.getInputData());
            if (example.getResultData() != null) envelope.set("resultData", example.getResultData());
            return envelope;
        }

        if (!force) {
            JsonNode cached = cachedTranslation(example, targetLanguage);
            if (cached != null) return cached;
        }

        // Cache miss — only DEVs can trigger generation.
        if (!"DEV".equals(callerRole)) {
            throw new ForbiddenException(
                    "Translation for this language has not been generated yet. Ask a DEV to generate it.");
        }
        if (example.getResultData() == null) {
            throw new BadRequestException("Example has no analysis to translate");
        }

        JsonNode translated = aiService
                .translateReport(example.getInputData(), example.getResultData(), targetLanguage)
                .block();
        if (translated == null || !translated.isObject()) {
            throw new BadRequestException("Translator returned an empty or invalid payload");
        }

        ObjectNode cache = (example.getTranslations() != null && example.getTranslations().isObject())
                ? example.getTranslations().deepCopy()
                : objectMapper.createObjectNode();
        ObjectNode entry = objectMapper.createObjectNode();
        if (translated.has("inputData")) entry.set("inputData", translated.get("inputData"));
        if (translated.has("resultData")) entry.set("resultData", translated.get("resultData"));
        entry.put("generatedAt", Instant.now().toString());
        cache.set(targetLanguage, entry);
        example.setTranslations(cache);
        exampleRepository.save(example);
        return entry;
    }

    // ────────────────────────────────────────────────────────────────
    // Internals
    // ────────────────────────────────────────────────────────────────

    private void persistTranslation(UUID exampleId, String targetLanguage, ObjectNode entry) {
        try {
            transactionTemplate.executeWithoutResult(status -> {
                Example example = exampleRepository.findById(exampleId).orElse(null);
                if (example == null) return;
                ObjectNode cache = (example.getTranslations() != null && example.getTranslations().isObject())
                        ? example.getTranslations().deepCopy()
                        : objectMapper.createObjectNode();
                cache.set(targetLanguage, entry);
                example.setTranslations(cache);
                exampleRepository.save(example);
            });
        } catch (RuntimeException e) {
            log.warn(
                    "Failed to persist streamed example translation for {} ({}): {}",
                    exampleId,
                    targetLanguage,
                    e.getMessage());
        }
    }

    private JsonNode cachedTranslation(Example example, String targetLanguage) {
        JsonNode translations = example.getTranslations();
        if (translations == null || !translations.isObject()) return null;
        JsonNode entry = translations.get(targetLanguage);
        if (entry == null || !entry.isObject()) return null;
        return entry;
    }

    /** Throw {@link ForbiddenException} unless the caller is a DEV. */
    private static void requireDev(String role) {
        if (!"DEV".equals(role)) {
            throw new ForbiddenException("Only DEV users can perform this action");
        }
    }
}
