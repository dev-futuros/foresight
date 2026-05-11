package com.foresight.backend.share;

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
            @RequestParam(value = "language", required = false) String language) {
        UUID ownerId = principal.id();
        return () -> {
            ShareToken share = shareService.createForReport(reportId, ownerId, language);
            return ResponseEntity.status(201)
                    .body(CreateShareResponse.from(share, shareService.publicBaseUrl(), language));
        };
    }
}
