package com.foresight.backend.common.exception;

/**
 * Thrown to signal a client-side problem that should map to HTTP 400.
 *
 * <p>Use for domain-level rejections that are not covered by Bean Validation, such as
 * "token expired" or "incompatible state transition". Handled centrally by
 * {@link GlobalExceptionHandler}.
 */
public class BadRequestException extends RuntimeException {

    /**
     * @param message message safe to return to the client
     */
    public BadRequestException(String message) {
        super(message);
    }
}
