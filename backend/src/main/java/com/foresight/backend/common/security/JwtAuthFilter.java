package com.foresight.backend.common.security;

import java.io.IOException;
import java.util.List;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.lang.NonNull;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import com.foresight.backend.common.config.SecurityProperties;
import com.foresight.backend.user.User;
import com.foresight.backend.user.UserService;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Servlet filter that extracts a session JWT from the {@code Authorization: Bearer <token>}
 * header, validates it against the external identity provider's JWKS (Kinde), resolves the
 * corresponding local {@link User}, and populates the
 * Spring {@link SecurityContextHolder} with an {@link AuthenticatedUser} principal.
 *
 * <p>Runs once per request (via {@link OncePerRequestFilter}) and is inserted before
 * {@link org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter} in
 * {@link com.foresight.backend.common.config.SecurityConfig}.
 *
 * <p>Lazy-sync semantics: the source of truth for users is the external provider. A local row
 * is created on first authenticated request if the webhook hasn't replicated it yet — this
 * hides ordering races between the {@code user.created} webhook and the user's first API call.
 * Subsequent profile mutations (name change, deletion) are still reconciled by the webhook.
 *
 * <p>If the token is missing, malformed, or invalid, the failure is logged at DEBUG level and the
 * security context is left empty — downstream authorization rules then reject the request with
 * 401.
 *
 * <p>When {@link SecurityProperties#authDisabled()} is {@code true} (local dev only), a synthetic
 * {@link DevPrincipal} is injected if no valid token was provided.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class JwtAuthFilter extends OncePerRequestFilter {

    private static final String HEADER = "Authorization";
    private static final String PREFIX = "Bearer ";

    private final JwtDecoder jwtDecoder;
    private final UserService userService;
    private final SecurityProperties securityProperties;

    /**
     * Re-run on async dispatches so the SecurityContext is restored on the new dispatch thread.
     *
     * <p>{@code SecurityContextHolder} is thread-local, and Spring MVC's async dispatch (used when a
     * controller returns {@code Mono}/{@code DeferredResult}) hands the request to a new Tomcat
     * thread. Without re-running this filter on the dispatch thread the context is empty,
     * {@code AuthorizationFilter} sees an anonymous request and rejects it with {@code 403} — even
     * though the original handler completed successfully. The filter is idempotent (only
     * authenticates when no auth is present), so re-running it is safe.
     */
    @Override
    protected boolean shouldNotFilterAsyncDispatch() {
        return false;
    }

    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull FilterChain filterChain)
            throws ServletException, IOException {
        String header = request.getHeader(HEADER);
        if (header != null
                && header.startsWith(PREFIX)
                && SecurityContextHolder.getContext().getAuthentication() == null) {
            String token = header.substring(PREFIX.length()).trim();

            // Common Swagger paste mistake: pasting "Bearer eyJ..." into a dialog that already
            // prepends "Bearer " yields "Bearer Bearer eyJ...". Strip the duplicate prefix
            // so the token still validates.
            if (token.startsWith(PREFIX)) {
                log.debug("Stripped duplicated 'Bearer ' prefix from Authorization header");
                token = token.substring(PREFIX.length()).trim();
            }

            try {
                Jwt jwt = jwtDecoder.decode(token);
                String externalUserId = jwt.getSubject();
                if (externalUserId == null || externalUserId.isBlank()) {
                    log.debug("JWT decoded but `sub` claim is empty");
                } else {
                    User user = userService.findOrCreateByExternalUserId(externalUserId);
                    authenticate(user);
                }
            } catch (JwtException ex) {
                log.debug(
                        "JWT validation failed for {} {}: {}",
                        request.getMethod(),
                        request.getRequestURI(),
                        ex.getMessage());
            }
        }

        // Local-dev fallback: when auth is disabled and no valid principal is present,
        // inject the synthetic dev user so @CurrentUser-bound controllers keep working.
        if (securityProperties.authDisabled()
                && SecurityContextHolder.getContext().getAuthentication() == null) {
            authenticateDev();
        }

        filterChain.doFilter(request, response);
    }

    private void authenticate(User user) {
        AuthenticatedUser principal = new AuthenticatedUser(
                user.getId(), user.getExternalUserId(), user.getRole().name());
        var authority = new SimpleGrantedAuthority("ROLE_" + user.getRole().name());
        var auth = new UsernamePasswordAuthenticationToken(principal, null, List.of(authority));
        SecurityContextHolder.getContext().setAuthentication(auth);
    }

    private void authenticateDev() {
        AuthenticatedUser principal =
                new AuthenticatedUser(DevPrincipal.ID, DevPrincipal.EXTERNAL_USER_ID, DevPrincipal.ROLE);
        var authority = new SimpleGrantedAuthority("ROLE_" + DevPrincipal.ROLE);
        var auth = new UsernamePasswordAuthenticationToken(principal, null, List.of(authority));
        SecurityContextHolder.getContext().setAuthentication(auth);
    }
}
