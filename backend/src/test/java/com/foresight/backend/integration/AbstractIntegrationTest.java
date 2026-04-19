package com.foresight.backend.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.containers.PostgreSQLContainer;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.foresight.backend.common.email.EmailService;

/**
 * Shared base for end-to-end integration tests.
 *
 * <p>Starts a real Postgres via Testcontainers (shared across all subclasses to keep the suite
 * fast), boots the full Spring context, wires {@link MockMvc}, and swaps the real
 * {@link EmailService} for a recording in-memory stub so tests can grab the raw tokens that
 * the flows dispatch.
 *
 * <p>Uses {@code @ActiveProfiles("test")} to load
 * {@code src/test/resources/application-test.properties} — notably to lift the auth rate
 * limiter ceiling so tests don't trip 429s against each other.
 *
 * <p><b>Container lifecycle.</b> Uses the <em>singleton container pattern</em>: the Postgres
 * container is started once in a static initializer and reused across every subclass. We
 * deliberately do NOT use {@code @Testcontainers} + {@code @Container} here because those
 * manage lifecycle per test class, which interacts badly with Spring's test-context caching:
 * the cached context ends up pointing at a container that was already torn down when the
 * previous class finished, and the next class gets a flood of "connection refused". With the
 * singleton pattern the JVM shutdown hook shared by Ryuk cleans up the container instead.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(AbstractIntegrationTest.RecordingEmailConfig.class)
public abstract class AbstractIntegrationTest {

    @SuppressWarnings("resource") // Started once, torn down by Ryuk at JVM exit.
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

    static {
        POSTGRES.start();
    }

    @DynamicPropertySource
    static void datasourceProps(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @Autowired
    protected MockMvc mockMvc;

    @Autowired
    protected ObjectMapper objectMapper;

    @Autowired
    protected RecordingEmailService recordingEmailService;

    /**
     * Registers a fresh user with a random email and returns the JWT the server issued.
     *
     * @param password the plaintext password to use for the new account
     * @return a {@link RegisteredUser} bundle with id, email, and access token
     */
    protected RegisteredUser registerRandomUser(String password) throws Exception {
        String email = "user-" + UUID.randomUUID() + "@example.com";
        Map<String, Object> body = Map.of("email", email, "password", password, "name", "IT User", "language", "es");

        MvcResult result = mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andReturn();

        assertThat(result.getResponse().getStatus())
                .as("registration HTTP status for %s", email)
                .isEqualTo(201);

        JsonNode json = objectMapper.readTree(result.getResponse().getContentAsString());
        return new RegisteredUser(
                UUID.fromString(json.get("user").get("id").asText()),
                email,
                json.get("accessToken").asText());
    }

    /** Convenience for tests that don't care about the password. */
    protected RegisteredUser registerRandomUser() throws Exception {
        return registerRandomUser("OriginalPass!1");
    }

    /** Represents a registered account and its freshly-issued JWT. */
    public record RegisteredUser(UUID id, String email, String accessToken) {
        public String bearer() {
            return "Bearer " + accessToken;
        }
    }

    /**
     * In-memory {@link EmailService} that captures the last (toEmail → rawToken) pair for each
     * flow. Tests call {@link RecordingEmailService#lastPasswordResetToken(String)} and
     * {@link RecordingEmailService#lastEmailVerificationToken(String)} to get the raw token a real
     * recipient would receive.
     */
    @TestConfiguration
    public static class RecordingEmailConfig {
        @Bean
        @Primary
        public RecordingEmailService recordingEmailService() {
            return new RecordingEmailService();
        }
    }

    /** See {@link RecordingEmailConfig}. */
    public static class RecordingEmailService implements EmailService {
        private final Map<String, String> passwordResetTokens = new HashMap<>();
        private final Map<String, String> emailVerificationTokens = new HashMap<>();

        @Override
        public void sendPasswordResetEmail(String toEmail, String rawToken) {
            passwordResetTokens.put(toEmail, rawToken);
        }

        @Override
        public void sendEmailVerificationEmail(String toEmail, String rawToken) {
            emailVerificationTokens.put(toEmail, rawToken);
        }

        public String lastPasswordResetToken(String email) {
            return passwordResetTokens.get(email);
        }

        public String lastEmailVerificationToken(String email) {
            return emailVerificationTokens.get(email);
        }

        public void clear() {
            passwordResetTokens.clear();
            emailVerificationTokens.clear();
        }
    }
}
