package com.foresight.backend.common.security;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.lang.NonNull;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import lombok.RequiredArgsConstructor;

/**
 * Servlet filter that extracts a JWT from the {@code Authorization: Bearer <token>} header,
 * validates it, and populates the Spring {@link SecurityContextHolder} with an
 * {@link AuthenticatedUser} principal.
 *
 * <p>Runs once per request (via {@link OncePerRequestFilter}) and is inserted before
 * {@link org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter}
 * in {@link com.foresight.backend.common.config.SecurityConfig}.
 *
 * <p>If the token is missing, malformed, or invalid, the filter silently leaves the security
 * context empty — downstream authorization rules will then reject the request with 401.
 */
@Component
@RequiredArgsConstructor
public class JwtAuthFilter extends OncePerRequestFilter {

    private static final String HEADER = "Authorization";
    private static final String PREFIX = "Bearer ";

    private final JwtService jwtService;

    /**
     * Per-request filter logic.
     *
     * @param request     the incoming HTTP request
     * @param response    the outgoing HTTP response
     * @param filterChain the remaining filter chain
     * @throws ServletException if a downstream filter fails
     * @throws IOException      if I/O fails while reading/writing the request or response
     */
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
            String token = header.substring(PREFIX.length());
            try {
                Claims claims = jwtService.parse(token);
                UUID userId = UUID.fromString(claims.getSubject());
                String email = claims.get("email", String.class);
                String role = claims.get("role", String.class);

                AuthenticatedUser principal = new AuthenticatedUser(userId, email, role);
                var authority = new SimpleGrantedAuthority("ROLE_" + role);
                var auth = new UsernamePasswordAuthenticationToken(principal, null, List.of(authority));
                SecurityContextHolder.getContext().setAuthentication(auth);
            } catch (JwtException | IllegalArgumentException ignored) {
                // Invalid token → leave context empty → 401 downstream
            }
        }
        filterChain.doFilter(request, response);
    }
}
