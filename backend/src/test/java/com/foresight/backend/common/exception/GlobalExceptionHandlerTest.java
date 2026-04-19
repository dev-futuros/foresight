package com.foresight.backend.common.exception;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.List;

import jakarta.servlet.http.HttpServletRequest;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.validation.BeanPropertyBindingResult;
import org.springframework.web.bind.MethodArgumentNotValidException;

class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();
    private HttpServletRequest request;

    @BeforeEach
    void setup() {
        request = mock(HttpServletRequest.class);
        when(request.getRequestURI()).thenReturn("/api/anything");
    }

    @Test
    void notFoundMapsTo404() {
        ResponseEntity<ApiError> response = handler.handleNotFound(new NotFoundException("missing"), request);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(response.getBody().status()).isEqualTo(404);
        assertThat(response.getBody().message()).isEqualTo("missing");
        assertThat(response.getBody().path()).isEqualTo("/api/anything");
    }

    @Test
    void conflictMapsTo409() {
        ResponseEntity<ApiError> response = handler.handleConflict(new ConflictException("dup"), request);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(response.getBody().status()).isEqualTo(409);
    }

    @Test
    void forbiddenMapsTo403() {
        ResponseEntity<ApiError> response = handler.handleForbidden(new ForbiddenException("no"), request);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(response.getBody().status()).isEqualTo(403);
    }

    @Test
    void badCredentialsMapsTo401WithGenericMessage() {
        ResponseEntity<ApiError> response =
                handler.handleUnauthorized(new BadCredentialsException("real reason"), request);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        // Important: must NOT leak the underlying reason
        assertThat(response.getBody().message()).isEqualTo("Invalid credentials");
    }

    @Test
    void accessDeniedAlsoMapsTo401() {
        ResponseEntity<ApiError> response = handler.handleUnauthorized(new AccessDeniedException("no"), request);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void validationFailureReturns400WithFieldErrors() throws NoSuchMethodException {
        // Use a target with real fields so BindingResult can introspect properties
        BindingTarget target = new BindingTarget();
        BeanPropertyBindingResult binding = new BeanPropertyBindingResult(target, "dto");
        binding.rejectValue("email", "NotBlank", "must not be blank");
        binding.rejectValue("password", "Size", "must be at least 8 chars");

        MethodParameter methodParameter = new MethodParameter(this.getClass().getDeclaredMethod("setup"), -1);
        MethodArgumentNotValidException ex = new MethodArgumentNotValidException(methodParameter, binding);

        ResponseEntity<ApiError> response = handler.handleValidation(ex, request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        List<ApiError.FieldError> fieldErrors = response.getBody().fieldErrors();
        assertThat(fieldErrors).hasSize(2);
        assertThat(fieldErrors).extracting(ApiError.FieldError::field).containsExactlyInAnyOrder("email", "password");
    }

    @SuppressWarnings("unused")
    private static final class BindingTarget {
        private String email;
        private String password;

        public String getEmail() {
            return email;
        }

        public void setEmail(String email) {
            this.email = email;
        }

        public String getPassword() {
            return password;
        }

        public void setPassword(String password) {
            this.password = password;
        }
    }

    @Test
    void illegalArgumentMapsTo400() {
        ResponseEntity<ApiError> response = handler.handleBadRequest(new IllegalArgumentException("bad"), request);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getBody().message()).isEqualTo("bad");
    }

    @Test
    void fallbackMapsTo500WithGenericMessage() {
        ResponseEntity<ApiError> response = handler.handleGeneric(new RuntimeException("boom"), request);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        // Do not leak internal details
        assertThat(response.getBody().message()).isEqualTo("An unexpected error occurred");
    }
}
