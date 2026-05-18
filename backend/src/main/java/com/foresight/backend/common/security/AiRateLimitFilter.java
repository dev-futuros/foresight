package com.foresight.backend.common.security;

import java.io.IOException;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.lang.NonNull;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import com.foresight.backend.common.config.SecurityProperties;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import lombok.extern.slf4j.Slf4j;

/**
 * Token-bucket rate limiter for the AI proxy endpoints.
 *
 * <p>Every call to {@code /api/ai/*} burns Anthropic tokens, and the front-end exposes
 * "regenerate" buttons that a determined user could click in a tight loop or script. This
 * filter enforces a hard ceiling per authenticated user so the spend stays bounded even if
 * the UI is bypassed.
 *
 * <p>Keyed by the authenticated user's UUID — not the IP — because:
 * <ul>
 *   <li>AI endpoints require auth, so we always have a user.</li>
 *   <li>One user behind a NAT shouldn't share a bucket with their officemates, and an
 *       attacker rotating IPs shouldn't get fresh buckets per IP.</li>
 * </ul>
 *
 * <p>Two separate buckets per user, dispatched by path:
 * <ul>
 *   <li><b>{@code /api/ai/tighten}</b> — wider bucket (sized via
 *       {@link SecurityProperties.RateLimit#tighten()}). Tighten is a Haiku-tier layout helper
 *       called once per text field during PDF export; one legitimate export of a long report
 *       can fire 60+ requests in a single {@code Promise.all} burst.</li>
 *   <li><b>Every other {@code /api/ai/*}</b> — tight bucket (sized via
 *       {@link SecurityProperties.RateLimit#ai()}). Content-generation endpoints (analyze,
 *       suggest, chat) hit Opus/Sonnet — each call non-trivially expensive, so the bucket
 *       stays small enough to strangle scripted abuse.</li>
 * </ul>
 *
 * <p>Runs after {@link JwtAuthFilter} so the principal is already on the security context.
 * If somehow a request reaches us anonymously (auth disabled in dev), we let it through —
 * the synthetic dev user has its own UUID and gets its own bucket like anyone else.
 */
@Slf4j
@Component
public class AiRateLimitFilter extends OncePerRequestFilter {

    /** Path prefix protected by this filter. Matches every AI proxy endpoint. */
    private static final String AI_PATH_PREFIX = "/api/ai/";

    /** Exact path for the layout-helper tighten endpoint — gets the wider bucket. */
    private static final String TIGHTEN_PATH = "/api/ai/tighten";

    private final Map<UUID, Bucket> aiBuckets = new ConcurrentHashMap<>();
    private final Map<UUID, Bucket> tightenBuckets = new ConcurrentHashMap<>();
    private final SecurityProperties.RateLimit.Bucket aiConfig;
    private final SecurityProperties.RateLimit.Bucket tightenConfig;

    public AiRateLimitFilter(SecurityProperties properties) {
        SecurityProperties.RateLimit cfg = properties.rateLimit();
        this.aiConfig = cfg.ai();
        this.tightenConfig = cfg.tighten();
    }

    @Override
    protected boolean shouldNotFilter(@NonNull HttpServletRequest request) {
        return !request.getRequestURI().startsWith(AI_PATH_PREFIX);
    }

    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull FilterChain filterChain)
            throws ServletException, IOException {
        UUID userId = currentUserId();
        if (userId == null) {
            // No principal yet — let JWT auth / Spring Security reject this with 401 downstream.
            // We don't want to mask a missing-token error as a rate-limit error.
            filterChain.doFilter(request, response);
            return;
        }

        boolean isTighten = TIGHTEN_PATH.equals(request.getRequestURI());
        Bucket bucket = isTighten
                ? tightenBuckets.computeIfAbsent(userId, id -> newBucket(tightenConfig))
                : aiBuckets.computeIfAbsent(userId, id -> newBucket(aiConfig));

        if (bucket.tryConsume(1)) {
            filterChain.doFilter(request, response);
            return;
        }

        log.warn(
                "AI rate limit exceeded: user={} path={} flavor={}",
                userId,
                request.getRequestURI(),
                isTighten ? "tighten" : "ai");
        response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter()
                .write("{\"status\":429,\"error\":\"Too Many Requests\","
                        + "\"message\":\"You have hit the AI usage limit. Try again later.\"}");
    }

    private static Bucket newBucket(SecurityProperties.RateLimit.Bucket cfg) {
        return Bucket.builder()
                .addLimit(Bandwidth.builder()
                        .capacity(cfg.capacity())
                        .refillGreedy(cfg.refillTokens(), cfg.refillPeriod())
                        .build())
                .build();
    }

    private static UUID currentUserId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()) {
            return null;
        }
        if (auth.getPrincipal() instanceof AuthenticatedUser user) {
            return user.id();
        }
        return null;
    }
}
