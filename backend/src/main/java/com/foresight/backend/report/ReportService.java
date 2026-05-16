package com.foresight.backend.report;

import java.time.Instant;
import java.util.Set;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.foresight.backend.ai.AiService;
import com.foresight.backend.common.exception.BadRequestException;
import com.foresight.backend.common.exception.NotFoundException;
import com.foresight.backend.report.dto.CreateReportRequest;
import com.foresight.backend.report.dto.UpdateReportRequest;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

/**
 * Business logic for CRUD operations on {@link Report}.
 *
 * <p>Ownership is enforced on every read/write by requiring the caller's {@code userId} to
 * be passed in and using {@link ReportRepository#findByIdAndUserId} — this prevents
 * accidental cross-user access at the data layer, not just at the controller layer.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class ReportService {

    /** Languages currently accepted by the on-demand translator. */
    private static final Set<String> SUPPORTED_LANGUAGES = Set.of("es", "en");

    private final ReportRepository reportRepository;
    private final AiService aiService;
    private final ObjectMapper objectMapper;
    private final TransactionTemplate transactionTemplate;

    /**
     * Creates a new {@link ReportStatus#DRAFT} report for the given user.
     *
     * @param userId  owner UUID
     * @param request validated creation payload
     * @return the persisted report
     */
    @Transactional
    public Report create(UUID userId, CreateReportRequest request) {
        String lang = (request.primaryLanguage() != null && SUPPORTED_LANGUAGES.contains(request.primaryLanguage()))
                ? request.primaryLanguage()
                : "es";
        Report report = Report.builder()
                .userId(userId)
                .title(request.title())
                .status(ReportStatus.DRAFT)
                .inputData(request.inputData())
                .primaryLanguage(lang)
                .build();
        return reportRepository.save(report);
    }

    /**
     * Lists the given user's reports, newest first.
     *
     * @param userId   owner UUID
     * @param pageable pagination info
     * @return page of reports owned by the user
     */
    @Transactional(readOnly = true)
    public Page<Report> list(UUID userId, Pageable pageable) {
        return reportRepository.findByUserIdOrderByCreatedAtDesc(userId, pageable);
    }

    /**
     * Fetches a single report, enforcing ownership.
     *
     * @param id     report UUID
     * @param userId owner UUID (must match the report's owner)
     * @return the report
     * @throws NotFoundException if the report does not exist or belongs to another user
     */
    @Transactional(readOnly = true)
    public Report getOwned(UUID id, UUID userId) {
        return reportRepository
                .findByIdAndUserId(id, userId)
                .orElseThrow(() -> new NotFoundException("Report not found"));
    }

    /**
     * Partially updates a report the caller owns. {@code null} fields in the request are
     * ignored.
     *
     * @param id      report UUID
     * @param userId  owner UUID
     * @param request validated partial update
     * @return the updated report
     * @throws NotFoundException if the report does not exist or belongs to another user
     */
    @Transactional
    public Report update(UUID id, UUID userId, UpdateReportRequest request) {
        Report report = getOwned(id, userId);
        if (request.title() != null) report.setTitle(request.title());
        if (request.inputData() != null) report.setInputData(request.inputData());
        if (request.resultData() != null) {
            report.setResultData(request.resultData());
            // The wizard auto-saves a DRAFT on every step transition. The
            // status only flips to COMPLETED when the analysis succeeds and
            // we receive a non-null resultData payload — that's the contract
            // the frontend relies on to badge drafts in the dashboard. We
            // never downgrade from COMPLETED back to DRAFT on a subsequent
            // input-only PATCH (the user editing inputs after generating
            // shouldn't invalidate their previous result until they click
            // generate again).
            report.setStatus(ReportStatus.COMPLETED);
        }
        return reportRepository.save(report);
    }

    /**
     * Deletes a report the caller owns.
     *
     * @param id     report UUID
     * @param userId owner UUID
     * @throws NotFoundException if the report does not exist or belongs to another user
     */
    @Transactional
    public void delete(UUID id, UUID userId) {
        Report report = getOwned(id, userId);
        reportRepository.delete(report);
    }

    /**
     * Translate a report into the requested target language. Cached per
     * report row in the {@code translations} JSON column — a second call
     * for the same (report × language) returns the existing payload
     * without round-tripping to Anthropic unless {@code force} is set.
     *
     * <p>If the target language matches the report's primary language,
     * we return the original {@code inputData}/{@code resultData} pair
     * (no translation needed, no token spend).
     *
     * @param id             report UUID
     * @param userId         owner UUID
     * @param targetLanguage ISO-639-1 code ("es" or "en")
     * @param force          when {@code true}, ignore the cached entry and
     *                       re-translate (e.g. after the user has edited
     *                       the report and the cached copy is stale)
     * @return a JSON object with two top-level keys ({@code inputData},
     *         {@code resultData}) in the target language
     */
    @Transactional
    public JsonNode translate(UUID id, UUID userId, String targetLanguage, boolean force) {
        if (targetLanguage == null || !SUPPORTED_LANGUAGES.contains(targetLanguage)) {
            throw new BadRequestException(
                    "Unsupported target language: " + targetLanguage + ". Must be one of " + SUPPORTED_LANGUAGES);
        }
        Report report = getOwned(id, userId);

        // Primary language → no translation, return the originals as-is.
        if (targetLanguage.equals(report.getPrimaryLanguage())) {
            ObjectNode envelope = objectMapper.createObjectNode();
            if (report.getInputData() != null) envelope.set("inputData", report.getInputData());
            if (report.getResultData() != null) envelope.set("resultData", report.getResultData());
            return envelope;
        }

        // Cached translation hit — return it unless the caller forced a refresh.
        if (!force) {
            JsonNode cached = cachedTranslation(report, targetLanguage);
            if (cached != null) return cached;
        }

        // Cache miss — call the AI and persist the response.
        if (report.getResultData() == null) {
            throw new BadRequestException(
                    "Report has no analysis to translate. Generate the analysis before translating.");
        }
        JsonNode translated = aiService
                .translateReport(report.getInputData(), report.getResultData(), targetLanguage)
                .block();
        if (translated == null || !translated.isObject()) {
            throw new BadRequestException("Translator returned an empty or invalid payload");
        }

        // Persist into the translations cache, keyed by target language.
        ObjectNode cache =
                (report.getTranslations() != null && report.getTranslations().isObject())
                        ? report.getTranslations().deepCopy()
                        : objectMapper.createObjectNode();
        ObjectNode entry = objectMapper.createObjectNode();
        if (translated.has("inputData")) entry.set("inputData", translated.get("inputData"));
        if (translated.has("resultData")) entry.set("resultData", translated.get("resultData"));
        entry.put("generatedAt", Instant.now().toString());
        cache.set(targetLanguage, entry);
        report.setTranslations(cache);
        reportRepository.save(report);

        return entry;
    }

    /**
     * Streaming variant of {@link #translate}. Emits the
     * {@code progress}/{@code done} events produced by
     * {@link AiService#translateReportStream} so the frontend can
     * render a determinate progress bar while the translator runs.
     *
     * <p>The final {@code done} event is also persisted into the
     * translations cache on the report row (fire-and-forget via the
     * {@code Schedulers.boundedElastic()} pool so it doesn't block the
     * stream completion). If the language matches the report's primary
     * language, or if a cache entry already exists, a single
     * {@code done} event is emitted immediately and no AI call is
     * made.
     *
     * @param id             report UUID
     * @param userId         owner UUID
     * @param targetLanguage ISO-639-1 code ("es" or "en")
     * @param force          when {@code true}, bypass the cache and re-translate
     */
    public Flux<JsonNode> translateStream(UUID id, UUID userId, String targetLanguage, boolean force) {
        if (targetLanguage == null || !SUPPORTED_LANGUAGES.contains(targetLanguage)) {
            return Flux.error(new BadRequestException(
                    "Unsupported target language: " + targetLanguage + ". Must be one of " + SUPPORTED_LANGUAGES));
        }
        // Resolve the report + decide whether to translate inside its own
        // short read transaction. We deliberately keep the long-running
        // SSE flow OUTSIDE any open JPA transaction — otherwise the
        // connection sits on the pool for the full duration of the
        // Anthropic stream (~30s+), starving the pool under modest load.
        Report report;
        try {
            report = transactionTemplate.execute(status -> getOwned(id, userId));
        } catch (RuntimeException e) {
            return Flux.error(e);
        }
        if (report == null) return Flux.error(new NotFoundException("Report not found"));

        // Primary language → return originals immediately, single done event.
        if (targetLanguage.equals(report.getPrimaryLanguage())) {
            ObjectNode done = objectMapper.createObjectNode();
            done.put("type", "done");
            if (report.getInputData() != null) done.set("inputData", report.getInputData());
            if (report.getResultData() != null) done.set("resultData", report.getResultData());
            done.put("generatedAt", Instant.now().toString());
            return Flux.just(done);
        }

        // Cache hit → done event immediately, no AI call.
        if (!force) {
            JsonNode cached = cachedTranslation(report, targetLanguage);
            if (cached != null && cached.isObject()) {
                ObjectNode done = ((ObjectNode) cached.deepCopy());
                // The cached entry already carries inputData/resultData/generatedAt;
                // tag it as a done event for the frontend's switch.
                done.put("type", "done");
                return Flux.just(done);
            }
        }

        if (report.getResultData() == null) {
            return Flux.error(new BadRequestException(
                    "Report has no analysis to translate. Generate the analysis before translating."));
        }

        final UUID reportId = report.getId();
        final JsonNode inputData = report.getInputData();
        final JsonNode resultData = report.getResultData();

        return aiService
                .translateReportStream(inputData, resultData, targetLanguage)
                .concatMap(evt -> {
                    // Progress events pass through unchanged.
                    if (evt == null || !"done".equals(evt.path("type").asText())) {
                        return Mono.just(evt);
                    }
                    // Persist on a worker thread BEFORE emitting the done
                    // event to the client. The frontend immediately calls
                    // /share after `done` arrives, and that endpoint
                    // expects a warm cache — otherwise it would re-run
                    // the translator. Holding the event until persist
                    // completes adds <100ms but eliminates the race.
                    ObjectNode entry = objectMapper.createObjectNode();
                    if (evt.has("inputData")) entry.set("inputData", evt.get("inputData"));
                    if (evt.has("resultData")) entry.set("resultData", evt.get("resultData"));
                    entry.put(
                            "generatedAt",
                            evt.path("generatedAt").asText(Instant.now().toString()));
                    return Mono.fromRunnable(() -> persistTranslation(reportId, targetLanguage, entry))
                            .subscribeOn(Schedulers.boundedElastic())
                            .then(Mono.just(evt));
                });
    }

    /**
     * Persist the given translation entry into the {@code translations}
     * JSON column of the report row. Called from the streaming flow
     * once the {@code done} event has been emitted, on a worker thread
     * so the response Flux completes immediately after the client
     * receives its data.
     */
    private void persistTranslation(UUID reportId, String targetLanguage, ObjectNode entry) {
        try {
            transactionTemplate.executeWithoutResult(status -> {
                Report report = reportRepository.findById(reportId).orElse(null);
                if (report == null) return;
                ObjectNode cache = (report.getTranslations() != null
                                && report.getTranslations().isObject())
                        ? report.getTranslations().deepCopy()
                        : objectMapper.createObjectNode();
                cache.set(targetLanguage, entry);
                report.setTranslations(cache);
                reportRepository.save(report);
            });
        } catch (RuntimeException e) {
            log.warn(
                    "Failed to persist streamed translation for report {} ({}): {}",
                    reportId,
                    targetLanguage,
                    e.getMessage());
        }
    }

    /**
     * Drop the cached translation for the given language from a report
     * the caller owns. No-op (silently) when no entry exists for that
     * language — the API is idempotent so the frontend can fire it
     * without first checking whether the chip is actually there.
     *
     * <p>Refuses to delete the primary language: that's the source of
     * truth for the report's own content, not a translation, and
     * removing it would leave the report with no readable body.
     *
     * @param id       report UUID
     * @param userId   owner UUID
     * @param language ISO-639-1 code of the translation to drop
     */
    @Transactional
    public void deleteTranslation(UUID id, UUID userId, String language) {
        if (language == null || language.isBlank()) {
            throw new BadRequestException("Language is required");
        }
        Report report = getOwned(id, userId);
        if (language.equals(report.getPrimaryLanguage())) {
            throw new BadRequestException("Cannot delete the report's primary language (" + language + ")");
        }
        JsonNode translations = report.getTranslations();
        if (translations == null || !translations.isObject() || !translations.has(language)) {
            return;
        }
        ObjectNode next = translations.deepCopy();
        next.remove(language);
        report.setTranslations(next);
        reportRepository.save(report);
    }

    /**
     * Look up a cached translation for {@code targetLanguage}. Returns the
     * stored object node (with inputData / resultData / generatedAt keys)
     * or {@code null} if no cache entry exists yet.
     */
    private JsonNode cachedTranslation(Report report, String targetLanguage) {
        JsonNode translations = report.getTranslations();
        if (translations == null || !translations.isObject()) return null;
        JsonNode entry = translations.get(targetLanguage);
        if (entry == null || !entry.isObject()) return null;
        return entry;
    }

    /**
     * Replace the per-language entry in the report's {@code pdf_optimized} cache. The PDF
     * export pipeline calls this once it has tightened every field it needs for a target
     * layout; subsequent exports of the same report skip the {@code /api/ai/tighten} calls
     * and reuse the cached strings here.
     *
     * <p>If {@code fields} is empty (no tightening was actually needed for the chosen
     * layout) the language's cache entry is removed entirely — there's no point keeping a
     * stale "empty" row that pretends optimisation has been done.
     *
     * @param id       report UUID
     * @param userId   owner UUID — enforces ownership
     * @param language target language tag ({@code "en"} or {@code "es"})
     * @param fields   map of dotted JSON paths → tightened text; never {@code null}
     */
    @Transactional
    public void updatePdfOptimized(UUID id, UUID userId, String language, java.util.Map<String, String> fields) {
        if (language == null || language.isBlank()) {
            throw new BadRequestException("Language is required");
        }
        if (fields == null) {
            throw new BadRequestException("Fields map is required");
        }
        Report report = getOwned(id, userId);
        ObjectNode cache =
                (report.getPdfOptimized() != null && report.getPdfOptimized().isObject())
                        ? report.getPdfOptimized().deepCopy()
                        : objectMapper.createObjectNode();
        if (fields.isEmpty()) {
            cache.remove(language);
        } else {
            ObjectNode entry = objectMapper.createObjectNode();
            entry.put("version", 1);
            entry.put("generatedAt", Instant.now().toString());
            ObjectNode fieldsNode = objectMapper.createObjectNode();
            fields.forEach(fieldsNode::put);
            entry.set("fields", fieldsNode);
            cache.set(language, entry);
        }
        report.setPdfOptimized(cache);
        reportRepository.save(report);
    }
}
