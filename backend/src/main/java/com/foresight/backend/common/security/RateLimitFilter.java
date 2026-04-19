package com.foresight.backend.common.security;

import java.io.IOException;
import java.time.Duration;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import com.foresight.backend.common.config.SecurityProperties;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import lombok.extern.slf4j.Slf4j;

/**
 * In-memory token-bucket rate limiter for authentication endpoints.
 *
 * <p>Targets the endpoints most vulnerable to brute-force or spam:
 * <ul>
 *   <li>{@code POST /api/auth/login}</li>
 *   <li>{@code POST /api/auth/register}</li>
 *   <li>{@code POST /api/auth/forgot-password}</li>
 *   <li>{@code POST /api/auth/reset-password}</li>
 *   <li>{@code POST /api/auth/verify-email}</li>
 * </ul>
 *
 * <p>Keyed by client IP (with {@code X-Forwarded-For} preferred when present, so it still
 * works behind a reverse proxy). Buckets live in a {@link ConcurrentHashMap} — this is fine
 * for a single backend instance; migrate to a Redis-backed distributed bucket when we scale
 * horizontally.
 *
 * <p>Sizing lives in {@link SecurityProperties.RateLimit.Bucket}: capacity (burst tolerance)
 * + refill tokens per refill period. Defaults are generous for real users and cheap for
 * brute-force traffic.
 */
@Slf4j
@Component
public class RateLimitFilter extends OncePerRequestFilter {

    /** Paths throttled by this filter. Method is implicitly POST (checked inline). */
    private static final Set<String> LIMITED_PATHS = Set.of(
            "/api/auth/login",
            "/api/auth/register",
            "/api/auth/forgot-password",
            "/api/auth/reset-password",
            "/api/auth/verify-email");

    private final Map<String, Bucket> buckets = new ConcurrentHashMap<>();
    private final long capacity;
    private final long refillTokens;
    private final Duration refillPeriod;

    /**
     * @param properties typed security config; used to read bucket sizing at startup
     */
    public RateLimitFilter(SecurityProperties properties) {
        SecurityProperties.RateLimit.Bucket cfg = properties.rateLimit().auth();
        this.capacity = cfg.capacity();
        this.refillTokens = cfg.refillTokens();
        this.refillPeriod = cfg.refillPeriod();
    }

    @Override
    protected boolean shouldNotFilter(@NonNull HttpServletRequest request) {
        return !("POST".equals(request.getMethod()) && LIMITED_PATHS.contains(request.getRequestURI()));
    }

    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull FilterChain filterChain)
            throws ServletException, IOException {
        String key = clientIp(request);
        Bucket bucket = buckets.computeIfAbsent(key, this::newBucket);

        if (bucket.tryConsume(1)) {
            filterChain.doFilter(request, response);
            return;
        }

        log.warn("Rate limit exceeded: ip={} path={}", key, request.getRequestURI());
        response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter()
                .write("{\"status\":429,\"error\":\"Too Many Requests\","
                        + "\"message\":\"Slow down and try again in a minute.\"}");
    }

    /**
     * Lazily creates a bucket with the configured sizing. One bucket per distinct key
     * (typically the client IP).
     */
    private Bucket newBucket(String key) {
        return Bucket.builder()
                .addLimit(Bandwidth.builder()
                        .capacity(capacity)
                        .refillGreedy(refillTokens, refillPeriod)
                        .build())
                .build();
    }

    /**
     * Resolves the best-effort client IP: trust {@code X-Forwarded-For}'s first hop when
     * present (we assume a reverse proxy in prod), otherwise the direct remote address.
     */
    private static String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            int comma = forwarded.indexOf(',');
            return (comma > 0 ? forwarded.substring(0, comma) : forwarded).trim();
        }
        return request.getRemoteAddr();
    }
}
