package com.foresight.backend.share;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.foresight.backend.share.dto.PublicShareResponse;

import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;

/**
 * Public, unauthenticated read endpoint for shared report snapshots.
 *
 * <p>Lives under the dedicated {@code /api/public/**} prefix so the
 * {@link com.foresight.backend.common.config.SecurityConfig} allow-list can target it
 * narrowly without weakening security on the rest of {@code /api/**}.
 */
@RestController
@RequestMapping("/api/public/share")
@RequiredArgsConstructor
public class PublicShareController {

    private final ShareService shareService;

    /**
     * Returns the frozen snapshot for a still-valid share token. Returns 404 for both
     * unknown and expired tokens — the two are deliberately indistinguishable so an
     * attacker cannot probe whether a given token ever existed.
     */
    @Operation(summary = "Read a shared report by its public token (no auth required).")
    @GetMapping("/{token}")
    public PublicShareResponse get(@PathVariable String token) {
        return PublicShareResponse.from(shareService.findValidByToken(token));
    }
}
