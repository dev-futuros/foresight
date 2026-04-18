package com.foresight.backend.common.security;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import org.springframework.security.core.annotation.AuthenticationPrincipal;

/**
 * Shortcut annotation that injects the {@link AuthenticatedUser} into a controller method
 * parameter.
 *
 * <p>Equivalent to annotating the parameter with
 * {@code @AuthenticationPrincipal AuthenticatedUser} but shorter and clearer at call sites.
 *
 * <p>Example:
 * <pre>{@code
 * @GetMapping("/me")
 * public UserResponse me(@CurrentUser AuthenticatedUser principal) { ... }
 * }</pre>
 */
@Target(ElementType.PARAMETER)
@Retention(RetentionPolicy.RUNTIME)
@AuthenticationPrincipal
public @interface CurrentUser {}
