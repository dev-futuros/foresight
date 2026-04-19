package com.foresight.backend.common.exception;

import java.time.Instant;
import java.util.List;

/**
 * Standardised error payload returned by every HTTP error response.
 *
 * <p>Keeping the shape consistent lets the frontend write a single error-handling branch
 * instead of parsing different formats per endpoint.
 *
 * @param timestamp   server time the error was produced
 * @param status      HTTP status code
 * @param error       short, human-readable error name (e.g. {@code "Not Found"})
 * @param message     detailed message safe to show to the user
 * @param path        request path that produced the error
 * @param fieldErrors per-field validation errors when {@code status == 400}, otherwise {@code null}
 */
public record ApiError(
        Instant timestamp, int status, String error, String message, String path, List<FieldError> fieldErrors) {

    /**
     * Individual field-level validation error.
     *
     * @param field   name of the invalid field
     * @param message reason the field is invalid
     */
    public record FieldError(String field, String message) {}

    /**
     * Factory for generic (non-validation) errors.
     *
     * @param status  HTTP status code
     * @param error   short human-readable error name
     * @param message detailed message
     * @param path    request path
     * @return an {@code ApiError} without field errors
     */
    public static ApiError of(int status, String error, String message, String path) {
        return new ApiError(Instant.now(), status, error, message, path, null);
    }

    /**
     * Factory for 400 validation errors with a list of field problems.
     *
     * @param path        request path
     * @param fieldErrors collected per-field validation errors
     * @return an {@code ApiError} with status 400 and the provided field errors
     */
    public static ApiError ofValidation(String path, List<FieldError> fieldErrors) {
        return new ApiError(Instant.now(), 400, "Bad Request", "Validation failed", path, fieldErrors);
    }
}
