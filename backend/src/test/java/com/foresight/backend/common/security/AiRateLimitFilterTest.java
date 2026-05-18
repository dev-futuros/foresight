package com.foresight.backend.common.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import com.foresight.backend.common.config.SecurityProperties;

class AiRateLimitFilterTest {

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    /** Convenience for the original single-bucket-size tests — sizes both buckets the same. */
    private static AiRateLimitFilter filter(long capacity) {
        return filter(capacity, capacity);
    }

    private static AiRateLimitFilter filter(long aiCapacity, long tightenCapacity) {
        SecurityProperties props = new SecurityProperties(
                false,
                new SecurityProperties.Kinde(
                        "https://test.kinde.com",
                        "https://test.kinde.com",
                        "https://test.kinde.com/.well-known/jwks",
                        "https://test.kinde.com/oauth2/token",
                        "https://test.kinde.com/api/v1",
                        "https://test.kinde.com/api",
                        "https://test.kinde.com/account_api/v1",
                        "",
                        ""),
                new SecurityProperties.Cors(List.of()),
                // Huge refill period so refills never happen mid-test.
                new SecurityProperties.RateLimit(
                        new SecurityProperties.RateLimit.Bucket(aiCapacity, aiCapacity, Duration.ofHours(1)),
                        new SecurityProperties.RateLimit.Bucket(
                                tightenCapacity, tightenCapacity, Duration.ofHours(1))));
        return new AiRateLimitFilter(props);
    }

    private static void authenticateAs(UUID userId) {
        AuthenticatedUser principal = new AuthenticatedUser(userId, "user_external_test", "USER");
        // 3-arg ctor flips isAuthenticated() to true; the 2-arg ctor leaves it false and the
        // filter would treat the request as anonymous.
        SecurityContextHolder.getContext()
                .setAuthentication(new UsernamePasswordAuthenticationToken(principal, null, java.util.List.of()));
    }

    private static MockHttpServletRequest postTo(String path) {
        return new MockHttpServletRequest("POST", path);
    }

    @Test
    void allowsRequestsWhileBucketHasTokens() throws Exception {
        AiRateLimitFilter rateLimit = filter(3);
        authenticateAs(UUID.randomUUID());

        for (int i = 0; i < 3; i++) {
            MockHttpServletResponse response = new MockHttpServletResponse();
            MockFilterChain chain = new MockFilterChain();

            rateLimit.doFilter(postTo("/api/ai/suggest-steep"), response, chain);

            assertThat(response.getStatus()).isEqualTo(HttpStatus.OK.value());
            assertThat(chain.getRequest()).isNotNull();
        }
    }

    @Test
    void returns429WhenBucketIsExhausted() throws Exception {
        AiRateLimitFilter rateLimit = filter(2);
        authenticateAs(UUID.randomUUID());

        for (int i = 0; i < 2; i++) {
            rateLimit.doFilter(postTo("/api/ai/analyze"), new MockHttpServletResponse(), new MockFilterChain());
        }

        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();
        rateLimit.doFilter(postTo("/api/ai/analyze"), response, chain);

        assertThat(response.getStatus()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS.value());
        assertThat(response.getContentAsString()).contains("AI usage limit");
        assertThat(chain.getRequest()).isNull();
    }

    @Test
    void skipsNonAiPaths() throws Exception {
        AiRateLimitFilter rateLimit = filter(1);
        authenticateAs(UUID.randomUUID());

        // Burn the (would-be) only token on a non-AI path. Bucket must stay full.
        rateLimit.doFilter(postTo("/api/reports"), new MockHttpServletResponse(), new MockFilterChain());

        MockHttpServletResponse response = new MockHttpServletResponse();
        rateLimit.doFilter(postTo("/api/ai/global-steep"), response, new MockFilterChain());

        assertThat(response.getStatus()).isEqualTo(HttpStatus.OK.value());
    }

    @Test
    void bucketsArePerUser() throws Exception {
        AiRateLimitFilter rateLimit = filter(1);

        UUID alice = UUID.randomUUID();
        UUID bob = UUID.randomUUID();

        // Alice drains her bucket.
        authenticateAs(alice);
        rateLimit.doFilter(postTo("/api/ai/analyze"), new MockHttpServletResponse(), new MockFilterChain());

        // Bob still has a fresh one.
        authenticateAs(bob);
        MockHttpServletResponse bobResponse = new MockHttpServletResponse();
        rateLimit.doFilter(postTo("/api/ai/analyze"), bobResponse, new MockFilterChain());
        assertThat(bobResponse.getStatus()).isEqualTo(HttpStatus.OK.value());

        // Alice's next call is rate-limited.
        authenticateAs(alice);
        MockHttpServletResponse aliceResponse = new MockHttpServletResponse();
        rateLimit.doFilter(postTo("/api/ai/analyze"), aliceResponse, new MockFilterChain());
        assertThat(aliceResponse.getStatus()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS.value());
    }

    @Test
    void tightenAndAiUseSeparateBuckets() throws Exception {
        // Both buckets sized at 1. Draining one must NOT consume from the other —
        // /api/ai/tighten has its own bucket so legitimate PDF exports (which fire many
        // tighten calls in parallel) aren't starved by prior wizard activity.
        AiRateLimitFilter rateLimit = filter(1, 1);
        authenticateAs(UUID.randomUUID());

        // Drain the AI (content-generation) bucket.
        rateLimit.doFilter(postTo("/api/ai/analyze"), new MockHttpServletResponse(), new MockFilterChain());

        // Tighten bucket is untouched.
        MockHttpServletResponse tightenResponse = new MockHttpServletResponse();
        rateLimit.doFilter(postTo("/api/ai/tighten"), tightenResponse, new MockFilterChain());
        assertThat(tightenResponse.getStatus()).isEqualTo(HttpStatus.OK.value());
    }

    @Test
    void tightenBucketSizeReadsFromTightenConfig() throws Exception {
        // ai=1, tighten=3 — proves the filter dispatches /api/ai/tighten to the right config,
        // not just sharing the ai bucket size.
        AiRateLimitFilter rateLimit = filter(1, 3);
        authenticateAs(UUID.randomUUID());

        for (int i = 0; i < 3; i++) {
            MockHttpServletResponse response = new MockHttpServletResponse();
            MockFilterChain chain = new MockFilterChain();
            rateLimit.doFilter(postTo("/api/ai/tighten"), response, chain);
            assertThat(response.getStatus()).isEqualTo(HttpStatus.OK.value());
        }

        // Fourth tighten call hits the (3-cap) bucket limit.
        MockHttpServletResponse fourth = new MockHttpServletResponse();
        rateLimit.doFilter(postTo("/api/ai/tighten"), fourth, new MockFilterChain());
        assertThat(fourth.getStatus()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS.value());
    }

    @Test
    void allowsAnonymousRequestThroughSoDownstreamCanReturn401() throws Exception {
        AiRateLimitFilter rateLimit = filter(1);
        // No authenticateAs() — security context is empty.

        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();
        rateLimit.doFilter(postTo("/api/ai/analyze"), response, chain);

        // The filter must not consume the bucket nor return 429 — the missing principal is
        // someone else's responsibility (Spring Security will surface a 401).
        assertThat(response.getStatus()).isEqualTo(HttpStatus.OK.value());
        assertThat(chain.getRequest()).isNotNull();
    }
}
