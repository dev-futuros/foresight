package com.foresight.backend.report;

import java.util.UUID;
import java.util.concurrent.Callable;

import jakarta.validation.Valid;

import org.springdoc.core.annotations.ParameterObject;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.web.bind.annotation.*;

import reactor.core.publisher.Flux;

import com.fasterxml.jackson.databind.JsonNode;
import com.foresight.backend.common.security.AuthenticatedUser;
import com.foresight.backend.common.security.CurrentUser;
import com.foresight.backend.report.dto.CreateReportRequest;
import com.foresight.backend.report.dto.ReportResponse;
import com.foresight.backend.report.dto.ReportSummary;
import com.foresight.backend.report.dto.UpdateReportRequest;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import lombok.RequiredArgsConstructor;

/**
 * REST endpoints for managing foresight reports.
 *
 * <p>All routes require a valid JWT. Every operation is implicitly scoped to the authenticated
 * user — there is no way to reach another user's reports through this controller.
 */
@RestController
@RequestMapping("/api/reports")
@RequiredArgsConstructor
public class ReportController {

    private final ReportService reportService;

    /**
     * Creates a new report for the caller.
     *
     * @param principal authenticated caller
     * @param request   validated creation payload
     * @return HTTP 201 with the created report's full projection
     */
    @PostMapping
    public ResponseEntity<ReportResponse> create(
            @CurrentUser AuthenticatedUser principal, @Valid @RequestBody CreateReportRequest request) {
        return ResponseEntity.status(201).body(ReportResponse.from(reportService.create(principal.id(), request)));
    }

    /**
     * Lists the caller's reports. Pagination is driven by standard Spring query parameters.
     *
     * @param principal authenticated caller
     * @param pageable  pagination info (Spring resolves {@code page}, {@code size}, {@code sort}
     *                  automatically)
     * @return a page of lightweight report summaries
     */
    @Operation(
            summary = "List the caller's reports",
            description =
                    """
                    Paginated list of the authenticated user's reports, lightweight projection (no inputData/resultData blobs).

                    **Pagination parameters** (all optional):
                    - `page`  — zero-indexed page number. Default: `0`.
                    - `size`  — page size. Default: `20`. Typical max: `100`.
                    - `sort`  — `property,(asc|desc)`. Repeat the parameter to sort by multiple properties.
                              Valid properties: `createdAt`, `updatedAt`, `title`, `status`.
                              Examples: `createdAt,desc` (default-ish) · `title,asc` · `status,asc&sort=createdAt,desc`.
                    """)
    @GetMapping
    public Page<ReportSummary> list(
            @CurrentUser AuthenticatedUser principal,
            @Parameter(example = "createdAt,desc") @ParameterObject Pageable pageable) {
        return reportService.list(principal.id(), pageable).map(ReportSummary::from);
    }

    /**
     * Returns the full detail of one of the caller's reports.
     *
     * @param principal authenticated caller
     * @param id        report UUID
     * @return the report's full projection
     */
    @GetMapping("/{id}")
    public ReportResponse get(@CurrentUser AuthenticatedUser principal, @PathVariable UUID id) {
        return ReportResponse.from(reportService.getOwned(id, principal.id()));
    }

    /**
     * Partially updates a report owned by the caller.
     *
     * @param principal authenticated caller
     * @param id        report UUID
     * @param request   validated partial update
     * @return the updated report's full projection
     */
    @PatchMapping("/{id}")
    public ReportResponse update(
            @CurrentUser AuthenticatedUser principal,
            @PathVariable UUID id,
            @Valid @RequestBody UpdateReportRequest request) {
        return ReportResponse.from(reportService.update(id, principal.id(), request));
    }

    /**
     * Deletes a report owned by the caller.
     *
     * @param principal authenticated caller
     * @param id        report UUID
     * @return HTTP 204 on success
     */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@CurrentUser AuthenticatedUser principal, @PathVariable UUID id) {
        reportService.delete(id, principal.id());
        return ResponseEntity.noContent().build();
    }

    /**
     * Translate a report's {@code inputData} + {@code resultData} into the
     * requested target language and return the translated payload. Cached
     * per (report × language) — repeated calls reuse the stored copy
     * unless {@code force=true} is supplied.
     *
     * @param principal      authenticated caller
     * @param id             report UUID
     * @param targetLanguage ISO-639-1 two-letter code (currently {@code "es"} or {@code "en"})
     * @param force          when {@code true} bypasses the cache and re-translates
     * @return a JSON object: {@code { "inputData": ..., "resultData": ..., "generatedAt": ... }}
     */
    @Operation(
            summary = "Translate a report into another language",
            description =
                    """
                    Returns the report's inputData + resultData translated into the given target
                    language. The result is cached per (report × language) on the report row;
                    subsequent calls return the cached copy without round-tripping to the AI
                    provider unless `force=true` is supplied.

                    Returned as a Spring async `Callable` so the full Anthropic round-trip
                    (which can take 30s+ for a long report) runs under
                    `spring.mvc.async.request-timeout` (480s) rather than Tomcat's
                    short default connection timeout.
                    """)
    @PostMapping("/{id}/translate")
    public Callable<JsonNode> translate(
            @CurrentUser AuthenticatedUser principal,
            @PathVariable UUID id,
            @RequestParam("targetLanguage") String targetLanguage,
            @RequestParam(value = "force", defaultValue = "false") boolean force) {
        return () -> reportService.translate(id, principal.id(), targetLanguage, force);
    }

    /**
     * Server-Sent Events variant of {@link #translate}. Streams two kinds
     * of events while the translation is in flight so the frontend can
     * render a determinate progress bar:
     *
     * <ul>
     *   <li>{@code {"type":"progress","inputChars":N,"outputChars":M}} —
     *       emitted ~5 times per second while the translator streams text
     *       back. {@code outputChars / inputChars} is a usable proxy for
     *       percentage completion (the translated envelope is roughly the
     *       same length as the source).</li>
     *   <li>{@code {"type":"done","inputData":..., "resultData":..., "generatedAt":"..."}}
     *       — emitted once at the end, carrying the final parsed
     *       translation. The same payload gets persisted into the
     *       report's translations cache so subsequent share/export calls
     *       are cache hits.</li>
     * </ul>
     *
     * <p>If a cache entry already exists for {@code (report × language)}
     * and {@code force=false}, a single {@code done} event is emitted
     * immediately without contacting Anthropic.
     */
    @Operation(
            summary = "Translate a report (streaming)",
            description =
                    """
                    Server-Sent Events stream of `progress` then `done` events. Use this when
                    you want to render a real-time progress bar — the regular
                    `POST /{id}/translate` endpoint blocks until the translation is complete
                    and is fine for most callers.
                    """)
    @PostMapping(value = "/{id}/translate/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ServerSentEvent<JsonNode>> translateStream(
            @CurrentUser AuthenticatedUser principal,
            @PathVariable UUID id,
            @RequestParam("targetLanguage") String targetLanguage,
            @RequestParam(value = "force", defaultValue = "false") boolean force) {
        return reportService
                .translateStream(id, principal.id(), targetLanguage, force)
                .map(json -> ServerSentEvent.<JsonNode>builder().data(json).build());
    }

    /**
     * Drop a cached translation from a report the caller owns. Idempotent
     * — deleting a language that isn't materialised is a no-op (HTTP 204).
     * Refuses to delete the report's primary language (HTTP 400).
     *
     * @param principal authenticated caller
     * @param id        report UUID
     * @param language  ISO-639-1 code of the translation to remove
     * @return HTTP 204 on success
     */
    @Operation(summary = "Delete a cached translation from a report (owner only).")
    @DeleteMapping("/{id}/translations/{language}")
    public ResponseEntity<Void> deleteTranslation(
            @CurrentUser AuthenticatedUser principal,
            @PathVariable UUID id,
            @PathVariable String language) {
        reportService.deleteTranslation(id, principal.id(), language);
        return ResponseEntity.noContent().build();
    }
}
