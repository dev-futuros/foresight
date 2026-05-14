package com.foresight.backend.example;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;

import jakarta.validation.Valid;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.fasterxml.jackson.databind.JsonNode;
import com.foresight.backend.common.security.AuthenticatedUser;
import com.foresight.backend.common.security.CurrentUser;
import com.foresight.backend.example.dto.ExampleResponse;
import com.foresight.backend.example.dto.ExampleSummary;
import com.foresight.backend.example.dto.PromoteToExampleRequest;
import com.foresight.backend.share.ShareService;
import com.foresight.backend.share.ShareToken;
import com.foresight.backend.share.dto.CreateShareResponse;

import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import reactor.core.publisher.Flux;

/**
 * REST endpoints for example reports. Examples are global content: list and
 * read are open to every authenticated user, but every mutation (promote,
 * delete, translate, delete-translation) requires the caller to carry the
 * {@code DEV} role. The role check is enforced inside {@link ExampleService}
 * so a wayward caller hitting these paths directly still gets a 403.
 */
@RestController
@RequiredArgsConstructor
public class ExampleController {

    private final ExampleService exampleService;
    private final ShareService shareService;

    // ────────────────────────────────────────────────────────────────
    // Reads (any authenticated user)
    // ────────────────────────────────────────────────────────────────

    @Operation(summary = "List all examples (any authenticated user).")
    @GetMapping("/api/examples")
    public List<ExampleSummary> list() {
        return exampleService.list().stream().map(ExampleSummary::from).toList();
    }

    @Operation(summary = "Get a single example by id (any authenticated user).")
    @GetMapping("/api/examples/{id}")
    public ExampleResponse get(@PathVariable UUID id) {
        return ExampleResponse.from(exampleService.get(id));
    }

    // ────────────────────────────────────────────────────────────────
    // DEV-only writes
    // ────────────────────────────────────────────────────────────────

    /**
     * Promote a report owned by the caller into a new (or existing) example.
     * Lives under {@code /api/reports/{id}/promote-to-example} because the
     * canonical source-of-truth is the report — the dev is acting on their
     * own report row. DEV-only.
     */
    @Operation(summary = "Promote a report to an example (DEV only).")
    @PostMapping("/api/reports/{reportId}/promote-to-example")
    public ResponseEntity<ExampleResponse> promote(
            @CurrentUser AuthenticatedUser principal,
            @PathVariable UUID reportId,
            @Valid @RequestBody PromoteToExampleRequest request) {
        Example created = exampleService.promoteReport(
                reportId, principal.id(), principal.role(), request);
        return ResponseEntity.status(201).body(ExampleResponse.from(created));
    }

    @Operation(summary = "Delete an example (DEV only).")
    @DeleteMapping("/api/examples/{id}")
    public ResponseEntity<Void> delete(
            @CurrentUser AuthenticatedUser principal, @PathVariable UUID id) {
        exampleService.delete(id, principal.role());
        return ResponseEntity.noContent().build();
    }

    /**
     * Translate an example. Cache-warm calls return instantly (any user);
     * cache-cold calls require the {@code DEV} role because they spend
     * Anthropic budget. {@link Callable} wraps the synchronous path so the
     * 30-second AI round-trip uses Spring MVC's {@code async.request-timeout}
     * (480s) instead of Tomcat's short connection timeout.
     */
    @Operation(summary = "Translate an example into a target language.")
    @PostMapping("/api/examples/{id}/translate")
    public Callable<JsonNode> translate(
            @CurrentUser AuthenticatedUser principal,
            @PathVariable UUID id,
            @RequestParam("targetLanguage") String targetLanguage,
            @RequestParam(value = "force", defaultValue = "false") boolean force) {
        return () -> exampleService.translate(id, principal.role(), targetLanguage, force);
    }

    /** Streaming translate for the DEV-side progress bar. DEV only. */
    @Operation(summary = "Translate an example (streaming, DEV only).")
    @PostMapping(value = "/api/examples/{id}/translate/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ServerSentEvent<JsonNode>> translateStream(
            @CurrentUser AuthenticatedUser principal,
            @PathVariable UUID id,
            @RequestParam("targetLanguage") String targetLanguage,
            @RequestParam(value = "force", defaultValue = "false") boolean force) {
        return exampleService
                .translateStream(id, principal.role(), targetLanguage, force)
                .map(json -> ServerSentEvent.<JsonNode>builder().data(json).build());
    }

    @Operation(summary = "Delete a cached translation from an example (DEV only).")
    @DeleteMapping("/api/examples/{id}/translations/{language}")
    public ResponseEntity<Void> deleteTranslation(
            @CurrentUser AuthenticatedUser principal,
            @PathVariable UUID id,
            @PathVariable String language) {
        exampleService.deleteTranslation(id, principal.role(), language);
        return ResponseEntity.noContent().build();
    }

    /**
     * Mint a public share token for an example. Open to any authenticated
     * user — examples are global content. {@link Callable} keeps the
     * Tomcat connection alive past 30s if the underlying translate call
     * has to materialise a non-primary language; in practice this is
     * usually a cache hit and the response returns in milliseconds.
     */
    @Operation(summary = "Create a public share link for an example (any authenticated user).")
    @PostMapping("/api/examples/{id}/share")
    public Callable<ResponseEntity<CreateShareResponse>> share(
            @CurrentUser AuthenticatedUser principal,
            @PathVariable UUID id,
            @RequestParam(value = "language", required = false) String language,
            // Same semantics as the report share endpoint: comma-
            // separated list of languages to bake into the snapshot.
            // Omitting it includes every language the example has.
            @RequestParam(value = "languages", required = false) String languages) {
        UUID userId = principal.id();
        String role = principal.role();
        List<String> include =
                com.foresight.backend.share.ShareController.parseLanguages(languages);
        return () -> {
            ShareToken share = shareService.createForExample(id, userId, role, language, include);
            return ResponseEntity.status(201)
                    .body(CreateShareResponse.from(share, shareService.publicBaseUrl(), language));
        };
    }

    /**
     * Demote an example back to a private report owned by the calling
     * DEV. The example row is removed; the new report becomes the dev's
     * personal copy and can be edited, deleted, or re-promoted later
     * (under a new slug if desired). DEV-only.
     *
     * @return the new report's id in a {@code {"reportId": "..."}}
     *         envelope so the frontend can navigate to
     *         {@code /reports/:id} without a follow-up fetch
     */
    @Operation(summary = "Demote an example back to a private report (DEV only).")
    @PostMapping("/api/examples/{id}/demote")
    public ResponseEntity<DemoteResponse> demote(
            @CurrentUser AuthenticatedUser principal, @PathVariable UUID id) {
        UUID reportId = exampleService.demoteToReport(id, principal.id(), principal.role());
        return ResponseEntity.status(201).body(new DemoteResponse(reportId));
    }

    /** Response from {@link #demote} — small wrapper so the frontend
     *  receives a well-typed object instead of a bare string. */
    public record DemoteResponse(UUID reportId) {}
}
