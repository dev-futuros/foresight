package com.foresight.backend.share.dto;

import java.time.Instant;

import com.fasterxml.jackson.databind.JsonNode;
import com.foresight.backend.share.ShareToken;

/**
 * Read-only projection served on the public {@code /api/public/share/{token}} endpoint.
 *
 * <p>Deliberately does <strong>not</strong> include the original {@code reportId} or any
 * owner identifier — third-party recipients only need to see the report content, never
 * who created it or which internal id it maps to.
 */
public record PublicShareResponse(
        String title,
        JsonNode inputData,
        JsonNode resultData,
        Instant createdAt,
        Instant expiresAt) {

    public static PublicShareResponse from(ShareToken share) {
        return new PublicShareResponse(
                share.getTitle(),
                share.getInputData(),
                share.getResultData(),
                share.getCreatedAt(),
                share.getExpiresAt());
    }
}
