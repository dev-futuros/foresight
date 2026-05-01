package com.foresight.backend.common.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import com.foresight.backend.common.config.SecurityProperties;

class RateLimitFilterTest {

    private static RateLimitFilter filter(long capacity) {
        SecurityProperties props = new SecurityProperties(
                false,
                new SecurityProperties.Jwt("test-secret-at-least-32-chars-long!!", Duration.ofHours(1)),
                new SecurityProperties.Cors(List.of()),
                Duration.ofMinutes(30),
                Duration.ofHours(24),
                new SecurityProperties.RateLimit(
                        // Huge refill period so refills never happen mid-test — we want the
                        // bucket to deplete deterministically.
                        new SecurityProperties.RateLimit.Bucket(capacity, capacity, Duration.ofHours(1)),
                        new SecurityProperties.RateLimit.Bucket(30, 30, Duration.ofHours(1))));
        return new RateLimitFilter(props);
    }

    private static MockHttpServletRequest postTo(String path) {
        MockHttpServletRequest req = new MockHttpServletRequest("POST", path);
        req.setRemoteAddr("10.0.0.1");
        return req;
    }

    @Test
    void allowsRequestsWhileBucketHasTokens() throws Exception {
        RateLimitFilter rateLimit = filter(3);

        for (int i = 0; i < 3; i++) {
            MockHttpServletResponse response = new MockHttpServletResponse();
            MockFilterChain chain = new MockFilterChain();

            rateLimit.doFilter(postTo("/api/auth/login"), response, chain);

            assertThat(response.getStatus()).isEqualTo(HttpStatus.OK.value());
            assertThat(chain.getRequest()).isNotNull();
        }
    }

    @Test
    void returns429WhenBucketIsExhausted() throws Exception {
        RateLimitFilter rateLimit = filter(2);

        // Drain the bucket.
        for (int i = 0; i < 2; i++) {
            rateLimit.doFilter(postTo("/api/auth/login"), new MockHttpServletResponse(), new MockFilterChain());
        }

        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();
        rateLimit.doFilter(postTo("/api/auth/login"), response, chain);

        assertThat(response.getStatus()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS.value());
        assertThat(response.getContentType()).isEqualTo(MediaType.APPLICATION_JSON_VALUE);
        assertThat(response.getContentAsString()).contains("429").contains("Too Many Requests");
        // The filter chain must NOT have advanced — the request was short-circuited.
        assertThat(chain.getRequest()).isNull();
    }

    @Test
    void skipsUnlimitedPaths() throws Exception {
        RateLimitFilter rateLimit = filter(1);

        // Burn the only token on a non-limited path — filter must NOT consume the bucket.
        rateLimit.doFilter(postTo("/api/reports"), new MockHttpServletResponse(), new MockFilterChain());

        // Limited path should still have its full bucket available.
        MockHttpServletResponse response = new MockHttpServletResponse();
        rateLimit.doFilter(postTo("/api/auth/login"), response, new MockFilterChain());
        assertThat(response.getStatus()).isEqualTo(HttpStatus.OK.value());
    }

    @Test
    void skipsNonPostMethods() throws Exception {
        RateLimitFilter rateLimit = filter(1);

        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/api/auth/login");
        req.setRemoteAddr("10.0.0.1");
        rateLimit.doFilter(req, new MockHttpServletResponse(), new MockFilterChain());

        // The bucket should be untouched — a subsequent POST still passes.
        MockHttpServletResponse response = new MockHttpServletResponse();
        rateLimit.doFilter(postTo("/api/auth/login"), response, new MockFilterChain());
        assertThat(response.getStatus()).isEqualTo(HttpStatus.OK.value());
    }

    @Test
    void bucketsArePerClientIp() throws Exception {
        RateLimitFilter rateLimit = filter(1);

        MockHttpServletRequest alice = new MockHttpServletRequest("POST", "/api/auth/login");
        alice.setRemoteAddr("10.0.0.1");
        MockHttpServletRequest bob = new MockHttpServletRequest("POST", "/api/auth/login");
        bob.setRemoteAddr("10.0.0.2");

        rateLimit.doFilter(alice, new MockHttpServletResponse(), new MockFilterChain());
        MockHttpServletResponse bobResponse = new MockHttpServletResponse();
        rateLimit.doFilter(bob, bobResponse, new MockFilterChain());

        // Alice drained her own bucket but Bob's is independent.
        assertThat(bobResponse.getStatus()).isEqualTo(HttpStatus.OK.value());

        MockHttpServletResponse aliceSecond = new MockHttpServletResponse();
        rateLimit.doFilter(alice, aliceSecond, new MockFilterChain());
        assertThat(aliceSecond.getStatus()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS.value());
    }

    @Test
    void prefersXForwardedForHeader() throws Exception {
        RateLimitFilter rateLimit = filter(1);

        // Two requests from the same remoteAddr but different X-Forwarded-For — each should
        // get its own bucket since the filter must trust the proxy header.
        MockHttpServletRequest req1 = new MockHttpServletRequest("POST", "/api/auth/login");
        req1.setRemoteAddr("192.168.1.1");
        req1.addHeader("X-Forwarded-For", "203.0.113.10, 192.168.1.1");

        MockHttpServletRequest req2 = new MockHttpServletRequest("POST", "/api/auth/login");
        req2.setRemoteAddr("192.168.1.1");
        req2.addHeader("X-Forwarded-For", "203.0.113.20, 192.168.1.1");

        rateLimit.doFilter(req1, new MockHttpServletResponse(), new MockFilterChain());
        MockHttpServletResponse response2 = new MockHttpServletResponse();
        rateLimit.doFilter(req2, response2, new MockFilterChain());

        assertThat(response2.getStatus()).isEqualTo(HttpStatus.OK.value());
    }
}
