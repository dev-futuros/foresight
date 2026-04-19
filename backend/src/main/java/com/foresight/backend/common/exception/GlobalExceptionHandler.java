package com.foresight.backend.common.exception;

import java.util.List;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import lombok.extern.slf4j.Slf4j;

/**
 * Central handler that converts exceptions into {@link ApiError} JSON responses.
 *
 * <p>Goals:
 * <ul>
 *   <li>Consistent error shape across the whole API (so the frontend handles errors uniformly).</li>
 *   <li>No stack traces or internal details leak to clients.</li>
 *   <li>Unexpected exceptions are logged server-side for debugging.</li>
 * </ul>
 */
@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    /**
     * Maps {@link NotFoundException} to HTTP 404.
     *
     * @param ex  the thrown exception
     * @param req current HTTP request (used to fill {@code path})
     * @return 404 response with an {@link ApiError} body
     */
    @ExceptionHandler(NotFoundException.class)
    public ResponseEntity<ApiError> handleNotFound(NotFoundException ex, HttpServletRequest req) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ApiError.of(404, "Not Found", ex.getMessage(), req.getRequestURI()));
    }

    /**
     * Maps {@link ConflictException} to HTTP 409.
     *
     * @param ex  the thrown exception
     * @param req current HTTP request
     * @return 409 response
     */
    @ExceptionHandler(ConflictException.class)
    public ResponseEntity<ApiError> handleConflict(ConflictException ex, HttpServletRequest req) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(ApiError.of(409, "Conflict", ex.getMessage(), req.getRequestURI()));
    }

    /**
     * Maps {@link ForbiddenException} to HTTP 403.
     *
     * @param ex  the thrown exception
     * @param req current HTTP request
     * @return 403 response
     */
    @ExceptionHandler(ForbiddenException.class)
    public ResponseEntity<ApiError> handleForbidden(ForbiddenException ex, HttpServletRequest req) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(ApiError.of(403, "Forbidden", ex.getMessage(), req.getRequestURI()));
    }

    /**
     * Maps authentication/authorization failures from Spring Security to HTTP 401 with a
     * generic "Invalid credentials" message (we do not leak whether the email exists).
     *
     * @param ex  the thrown exception
     * @param req current HTTP request
     * @return 401 response
     */
    @ExceptionHandler({BadCredentialsException.class, AccessDeniedException.class})
    public ResponseEntity<ApiError> handleUnauthorized(Exception ex, HttpServletRequest req) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(ApiError.of(401, "Unauthorized", "Invalid credentials", req.getRequestURI()));
    }

    /**
     * Maps Bean Validation failures ({@code @Valid} on DTOs) to HTTP 400 with per-field details.
     *
     * @param ex  the validation exception
     * @param req current HTTP request
     * @return 400 response with a populated {@link ApiError#fieldErrors()}
     */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiError> handleValidation(MethodArgumentNotValidException ex, HttpServletRequest req) {
        List<ApiError.FieldError> fieldErrors = ex.getBindingResult().getFieldErrors().stream()
                .map(fe -> new ApiError.FieldError(fe.getField(), fe.getDefaultMessage()))
                .toList();
        return ResponseEntity.badRequest().body(ApiError.ofValidation(req.getRequestURI(), fieldErrors));
    }

    /**
     * Maps {@link BadRequestException} (domain-level 400) and
     * {@link IllegalArgumentException} (lightweight shortcut used by services) to HTTP 400.
     *
     * @param ex  the thrown exception
     * @param req current HTTP request
     * @return 400 response
     */
    @ExceptionHandler({BadRequestException.class, IllegalArgumentException.class})
    public ResponseEntity<ApiError> handleBadRequest(Exception ex, HttpServletRequest req) {
        return ResponseEntity.badRequest().body(ApiError.of(400, "Bad Request", ex.getMessage(), req.getRequestURI()));
    }

    /**
     * Fallback for any unhandled exception: returns HTTP 500 with a generic message
     * and logs the full stack trace for server-side debugging.
     *
     * @param ex  the unexpected exception
     * @param req current HTTP request
     * @return 500 response
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiError> handleGeneric(Exception ex, HttpServletRequest req) {
        log.error("Unhandled exception at {}", req.getRequestURI(), ex);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ApiError.of(500, "Internal Server Error", "An unexpected error occurred", req.getRequestURI()));
    }
}
