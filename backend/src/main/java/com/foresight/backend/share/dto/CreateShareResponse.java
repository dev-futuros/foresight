package com.foresight.backend.share.dto;

import java.time.Instant;

import com.foresight.backend.share.ShareToken;

/**
 * Response returned to the report owner after minting a share token. The frontend uses
 * {@code shareUrl} verbatim — building it server-side keeps the canonical public origin
 * in one place rather than spread across clients.
 */
public record CreateShareResponse(String token, String shareUrl, Instant expiresAt) {
    public static CreateShareResponse from(ShareToken share, String publicBaseUrl) {
        String trimmed = publicBaseUrl.endsWith("/")
                ? publicBaseUrl.substring(0, publicBaseUrl.length() - 1)
                : publicBaseUrl;
        return new CreateShareResponse(
                share.getToken(),
                trimmed + "/share/" + share.getToken(),
                share.getExpiresAt());
    }
}
