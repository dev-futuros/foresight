package com.foresight.backend.ai;

/**
 * Raised when a call to the upstream AI provider fails.
 *
 * <p>Translated to an HTTP 5xx by the global exception handler. The cause/status is logged at
 * the point of failure in {@link AnthropicClient}; callers only need the fact that it failed.
 */
public class AiException extends RuntimeException {
    /**
     * @param message human-readable description (e.g. {@code "AI provider error: 429"})
     */
    public AiException(String message) {
        super(message);
    }
}
