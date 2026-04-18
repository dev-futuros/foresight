package com.foresight.backend.common.exception;

/**
 * Thrown when the caller is authenticated but not allowed to perform the requested action.
 *
 * <p>Handled by {@link GlobalExceptionHandler}, which maps it to HTTP 403.
 */
public class ForbiddenException extends RuntimeException {

    /**
     * @param message user-facing explanation of why the action is forbidden
     */
    public ForbiddenException(String message) {
        super(message);
    }
}
