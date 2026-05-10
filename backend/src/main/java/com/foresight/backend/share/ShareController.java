package com.foresight.backend.share;

import java.util.UUID;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
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
     */
    @Operation(summary = "Create a public share link for the given report (owner only).")
    @PostMapping("/share")
    public ResponseEntity<CreateShareResponse> create(
            @CurrentUser AuthenticatedUser principal, @PathVariable UUID reportId) {
        ShareToken share = shareService.createForReport(reportId, principal.id());
        return ResponseEntity.status(201)
                .body(CreateShareResponse.from(share, shareService.publicBaseUrl()));
    }
}
