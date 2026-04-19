package com.foresight.backend.common.exception;

/**
 * Thrown when a requested entity does not exist (or does not belong to the current user).
 *
 * <p>Handled by {@link GlobalExceptionHandler}, which maps it to HTTP 404.
 */
public class NotFoundException extends RuntimeException {

    /**
     * @param message user-facing explanation of what was not found
     */
    public NotFoundException(String message) {
        super(message);
    }
}
