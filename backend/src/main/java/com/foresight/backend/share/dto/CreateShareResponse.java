package com.foresight.backend.share.dto;

import java.time.Instant;

import com.foresight.backend.share.ShareToken;

/**
 * Response returned to the report owner after minting a share token. The frontend uses
 * {@code shareUrl} verbatim — building it server-side keeps the canonical public origin
 * in one place rather than spread across clients.
 *
 * <p>When the share was minted for a non-primary language, the URL carries a
 * {@code ?lang=en} (or {@code ?lang=es}) query param so the public viewer
 * can match its UI chrome to the snapshotted content language.
 */
public record CreateShareResponse(String token, String shareUrl, Instant expiresAt) {
    public static CreateShareResponse from(ShareToken share, String publicBaseUrl) {
        return from(share, publicBaseUrl, null);
    }

    public static CreateShareResponse from(ShareToken share, String publicBaseUrl, String language) {
        String trimmed = publicBaseUrl.endsWith("/")
                ? publicBaseUrl.substring(0, publicBaseUrl.length() - 1)
                : publicBaseUrl;
        String url = trimmed + "/share/" + share.getToken();
        if (language != null && !language.isBlank()) {
            url = url + "?lang=" + language;
        }
        return new CreateShareResponse(share.getToken(), url, share.getExpiresAt());
    }
}
