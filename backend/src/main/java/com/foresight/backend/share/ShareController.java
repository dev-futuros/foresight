package com.foresight.backend.share;

import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.foresight.backend.common.security.AuthenticatedUser;
import com.foresight.backend.common.security.CurrentUser;
import com.foresight.backend.share.dto.CreateShareResponse;

import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;

/**
 * Authenticated endpoint that lets a report owner mint a fresh public share link.
 *
 * <p>The complementary public read endpoint lives in {@link PublicShareController} under
 * {@code /api/public/share/{token}} so the security allow-list can target a single prefix.
 */
@RestController
@RequestMapping("/api/reports/{reportId}")
@RequiredArgsConstructor
public class ShareController {

    private final ShareService shareService;

    /**
     * Creates a fresh share token for the given report, snapshotting its current
     * title/inputs/results so subsequent edits or deletes don't propagate to existing
     * recipients.
     *
     * <p>When {@code language} is supplied and differs from the report's
     * primary language, the share is frozen with the translated copy.
     * Translation is materialised on demand (and cached on the report
     * row) so this can take ~10-30s the first time a given language is
     * requested.
     */
    /**
     * Returned as a Spring async {@link Callable} so the optional
     * translation round-trip (when {@code language} differs from the
     * report's primary language) gets the full
     * {@code spring.mvc.async.request-timeout} (480s) budget instead
     * of Tomcat's short default connection timeout. Without this, a
     * 30s+ translation call drops the connection and surfaces as
     * "AI provider unavailable" to the user.
     */
    @Operation(summary = "Create a public share link for the given report (owner only).")
    @PostMapping("/share")
    public Callable<ResponseEntity<CreateShareResponse>> create(
            @CurrentUser AuthenticatedUser principal,
            @PathVariable UUID reportId,
            @RequestParam(value = "language", required = false) String language,
            // Comma-separated list of languages to bake into the share.
            // Omitting it falls back to "every language the report
            // has", preserving the no-filter default. The shared
            // primary (the `language` param above) is always
            // implicitly included regardless of what's in this list.
            @RequestParam(value = "languages", required = false) String languages) {
        UUID ownerId = principal.id();
        List<String> include = parseLanguages(languages);
        return () -> {
            ShareToken share = shareService.createForReport(reportId, ownerId, language, include);
            return ResponseEntity.status(201)
                    .body(CreateShareResponse.from(share, shareService.publicBaseUrl(), language));
        };
    }

    /**
     * Split a comma-separated language list into a normalised
     * {@code List<String>}. Empty / null / whitespace-only inputs
     * yield {@code null} so {@code ShareService} sees no filter and
     * falls back to "include all".
     *
     * <p>Public because {@code ExampleController} (different package)
     * reuses the same parser to keep wire-format semantics identical
     * between the report-share and example-share endpoints.
     */
    public static List<String> parseLanguages(String raw) {
        if (raw == null) return null;
        String trimmed = raw.trim();
        if (trimmed.isEmpty()) return null;
        return Arrays.stream(trimmed.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toList();
    }
}
