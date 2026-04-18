package com.foresight.backend.common.exception;

/**
 * Thrown when a request conflicts with the current server state (e.g. duplicate email on signup).
 *
 * <p>Handled by {@link GlobalExceptionHandler}, which maps it to HTTP 409.
 */
public class ConflictException extends RuntimeException {

    /**
     * @param message user-facing explanation of the conflict
     */
    public ConflictException(String message) {
        super(message);
    }
}
