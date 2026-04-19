package com.foresight.backend.integration;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.HashMap;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * End-to-end coverage of {@code /api/users/me}: read, patch, delete, and auth gating.
 */
class UserFlowIntegrationTest extends AbstractIntegrationTest {

    @Test
    void getMeReturnsAuthenticatedUserProfile() throws Exception {
        RegisteredUser user = registerRandomUser();

        mockMvc.perform(get("/api/users/me").header("Authorization", user.bearer()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(user.id().toString()))
                .andExpect(jsonPath("$.email").value(user.email()))
                .andExpect(jsonPath("$.role").value("USER"))
                .andExpect(jsonPath("$.language").value("es"))
                .andExpect(jsonPath("$.emailVerified").value(false));
    }

    @Test
    void getMeRequiresAuthentication() throws Exception {
        // Spring's default AccessDeniedHandler → 403 when no credentials are presented at all.
        mockMvc.perform(get("/api/users/me")).andExpect(status().isForbidden());
    }

    @Test
    void getMeRejectsGarbageBearerToken() throws Exception {
        // Malformed JWT → JwtAuthFilter rejects before the security layer decides → 403.
        mockMvc.perform(get("/api/users/me").header("Authorization", "Bearer not-a-real-jwt"))
                .andExpect(status().isForbidden());
    }

    @Test
    void patchMeUpdatesNameAndLanguage() throws Exception {
        RegisteredUser user = registerRandomUser();

        mockMvc.perform(patch("/api/users/me")
                        .header("Authorization", user.bearer())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("name", "Updated Name", "language", "en"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Updated Name"))
                .andExpect(jsonPath("$.language").value("en"));

        // Verify persistence.
        mockMvc.perform(get("/api/users/me").header("Authorization", user.bearer()))
                .andExpect(jsonPath("$.name").value("Updated Name"))
                .andExpect(jsonPath("$.language").value("en"));
    }

    @Test
    void patchMeLeavesUnprovidedFieldsUntouched() throws Exception {
        RegisteredUser user = registerRandomUser();

        // Only name is sent — language must stay at the registration default ("es").
        Map<String, Object> partial = new HashMap<>();
        partial.put("name", "Just a Name");

        mockMvc.perform(patch("/api/users/me")
                        .header("Authorization", user.bearer())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(partial)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Just a Name"))
                .andExpect(jsonPath("$.language").value("es"));
    }

    @Test
    void patchMeRejectsInvalidLanguageWith400() throws Exception {
        RegisteredUser user = registerRandomUser();

        mockMvc.perform(patch("/api/users/me")
                        .header("Authorization", user.bearer())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("language", "fr"))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void patchMeRequiresAuthentication() throws Exception {
        mockMvc.perform(patch("/api/users/me")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("name", "x"))))
                .andExpect(status().isForbidden());
    }

    @Test
    void deleteMeRemovesAccountAndInvalidatesSubsequentCalls() throws Exception {
        RegisteredUser user = registerRandomUser();

        mockMvc.perform(delete("/api/users/me").header("Authorization", user.bearer()))
                .andExpect(status().isNoContent());

        // The JWT is still cryptographically valid, but the user no longer exists, so
        // subsequent authenticated calls must fail (401 from the auth filter, or 404 if the
        // filter lets the request through and the controller can't resolve the principal).
        mockMvc.perform(get("/api/users/me").header("Authorization", user.bearer()))
                .andExpect(status().is4xxClientError());
    }

    @Test
    void deleteMeRequiresAuthentication() throws Exception {
        mockMvc.perform(delete("/api/users/me")).andExpect(status().isForbidden());
    }
}
