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

    private static AiRateLimitFilter filter(long capacity) {
        SecurityProperties props = new SecurityProperties(
                false,
                new SecurityProperties.Clerk(
                        "https://test.clerk.accounts.dev",
                        "https://test.clerk.accounts.dev/.well-known/jwks.json",
                        "whsec_test"),
                new SecurityProperties.Cors(List.of()),
                // Huge refill so refills never happen mid-test.
                new SecurityProperties.RateLimit(
                        new SecurityProperties.RateLimit.Bucket(capacity, capacity, Duration.ofHours(1))));
        return new AiRateLimitFilter(props);
    }

    private static void authenticateAs(UUID userId) {
        AuthenticatedUser principal = new AuthenticatedUser(userId, "u@example.com", "USER");
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
