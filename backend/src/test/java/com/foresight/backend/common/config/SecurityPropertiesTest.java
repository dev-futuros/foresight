package com.foresight.backend.common.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.List;

import org.junit.jupiter.api.Test;

class SecurityPropertiesTest {

    @Test
    void recordStoresAllValues() {
        SecurityProperties properties = new SecurityProperties(
                true,
                new SecurityProperties.Jwt("test-secret-at-least-32-chars-long!!", Duration.ofHours(2)),
                new SecurityProperties.Cors(List.of("http://localhost:5173", "http://localhost:3000")),
                Duration.ofMinutes(30),
                Duration.ofHours(24),
                new SecurityProperties.RateLimit(
                        new SecurityProperties.RateLimit.Bucket(10, 5, Duration.ofMinutes(1))));

        assertThat(properties.authDisabled()).isTrue();
        assertThat(properties.jwt().secret()).isEqualTo("test-secret-at-least-32-chars-long!!");
        assertThat(properties.jwt().accessTokenTtl()).isEqualTo(Duration.ofHours(2));
        assertThat(properties.cors().allowedOrigins())
                .containsExactly("http://localhost:5173", "http://localhost:3000");
        assertThat(properties.passwordResetTokenTtl()).isEqualTo(Duration.ofMinutes(30));
        assertThat(properties.emailVerificationTokenTtl()).isEqualTo(Duration.ofHours(24));
        assertThat(properties.rateLimit().auth().capacity()).isEqualTo(10);
        assertThat(properties.rateLimit().auth().refillTokens()).isEqualTo(5);
        assertThat(properties.rateLimit().auth().refillPeriod()).isEqualTo(Duration.ofMinutes(1));
    }

    @Test
    void nestedRecordsCanBeConstructedIndependently() {
        SecurityProperties.Jwt jwt =
                new SecurityProperties.Jwt("another-test-secret-at-least-32-chars", Duration.ofMinutes(45));
        SecurityProperties.Cors cors = new SecurityProperties.Cors(List.of("https://example.com"));
        SecurityProperties.RateLimit.Bucket bucket =
                new SecurityProperties.RateLimit.Bucket(100, 20, Duration.ofSeconds(30));
        SecurityProperties.RateLimit rateLimit = new SecurityProperties.RateLimit(bucket);

        assertThat(jwt.secret()).contains("test-secret");
        assertThat(cors.allowedOrigins()).containsExactly("https://example.com");
        assertThat(rateLimit.auth().capacity()).isEqualTo(100);
        assertThat(rateLimit.auth().refillTokens()).isEqualTo(20);
        assertThat(rateLimit.auth().refillPeriod()).isEqualTo(Duration.ofSeconds(30));
    }
}
