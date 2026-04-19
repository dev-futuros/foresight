package com.foresight.backend.integration;

import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * End-to-end coverage of {@code /api/reports/**}: CRUD, ownership enforcement, auth gating.
 */
class ReportFlowIntegrationTest extends AbstractIntegrationTest {

    @Test
    void createReportReturns201AndPersistsDraft() throws Exception {
        RegisteredUser user = registerRandomUser();

        Map<String, Object> body =
                Map.of("title", "Q3 Foresight Report", "inputData", Map.of("companyProfile", Map.of("name", "Acme")));

        mockMvc.perform(post("/api/reports")
                        .header("Authorization", user.bearer())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id", notNullValue()))
                .andExpect(jsonPath("$.title").value("Q3 Foresight Report"))
                .andExpect(jsonPath("$.status").value("DRAFT"))
                .andExpect(jsonPath("$.inputData.companyProfile.name").value("Acme"))
                .andExpect(jsonPath("$.resultData").doesNotExist())
                .andExpect(jsonPath("$.createdAt", notNullValue()))
                .andExpect(jsonPath("$.updatedAt", notNullValue()));
    }

    @Test
    void createReportRejectsBlankTitleWith400() throws Exception {
        RegisteredUser user = registerRandomUser();

        mockMvc.perform(post("/api/reports")
                        .header("Authorization", user.bearer())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("title", "", "inputData", Map.of()))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void createReportRequiresAuthentication() throws Exception {
        // Spring Security's default entry point returns 403 for requests with no credentials.
        mockMvc.perform(post("/api/reports")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("title", "x", "inputData", Map.of()))))
                .andExpect(status().isForbidden());
    }

    @Test
    void listReturnsOnlyCallersReports() throws Exception {
        RegisteredUser alice = registerRandomUser();
        RegisteredUser bob = registerRandomUser();

        createReport(alice, "Alice report 1");
        createReport(alice, "Alice report 2");
        createReport(bob, "Bob report");

        // Alice sees her two reports, not Bob's.
        mockMvc.perform(get("/api/reports").header("Authorization", alice.bearer()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(2))
                .andExpect(jsonPath("$.totalElements").value(2));

        mockMvc.perform(get("/api/reports").header("Authorization", bob.bearer()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].title").value("Bob report"));
    }

    @Test
    void listSupportsPagination() throws Exception {
        RegisteredUser user = registerRandomUser();
        for (int i = 0; i < 5; i++) {
            createReport(user, "Report " + i);
        }

        mockMvc.perform(get("/api/reports?page=0&size=2").header("Authorization", user.bearer()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(2))
                .andExpect(jsonPath("$.totalElements", greaterThanOrEqualTo(5)))
                .andExpect(jsonPath("$.size").value(2))
                .andExpect(jsonPath("$.number").value(0));
    }

    @Test
    void listRequiresAuthentication() throws Exception {
        mockMvc.perform(get("/api/reports")).andExpect(status().isForbidden());
    }

    @Test
    void getReturnsFullDetailForOwner() throws Exception {
        RegisteredUser user = registerRandomUser();
        UUID id = createReport(user, "Detail Report");

        mockMvc.perform(get("/api/reports/" + id).header("Authorization", user.bearer()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id.toString()))
                .andExpect(jsonPath("$.title").value("Detail Report"))
                .andExpect(jsonPath("$.status").value("DRAFT"))
                .andExpect(jsonPath("$.inputData", notNullValue()));
    }

    @Test
    void getReturns404WhenReportBelongsToAnotherUser() throws Exception {
        RegisteredUser alice = registerRandomUser();
        RegisteredUser bob = registerRandomUser();
        UUID alicesReport = createReport(alice, "Alice only");

        // Bob tries to read Alice's report → 404 (never 403 — no enumeration).
        mockMvc.perform(get("/api/reports/" + alicesReport).header("Authorization", bob.bearer()))
                .andExpect(status().isNotFound());
    }

    @Test
    void getReturns404ForUnknownId() throws Exception {
        RegisteredUser user = registerRandomUser();

        mockMvc.perform(get("/api/reports/" + UUID.randomUUID()).header("Authorization", user.bearer()))
                .andExpect(status().isNotFound());
    }

    @Test
    void getRequiresAuthentication() throws Exception {
        mockMvc.perform(get("/api/reports/" + UUID.randomUUID())).andExpect(status().isForbidden());
    }

    @Test
    void patchUpdatesOnlyProvidedFields() throws Exception {
        RegisteredUser user = registerRandomUser();
        UUID id = createReport(user, "Original title");

        mockMvc.perform(patch("/api/reports/" + id)
                        .header("Authorization", user.bearer())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                Map.of("resultData", Map.of("scenarios", java.util.List.of(Map.of("name", "s1")))))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Original title"))
                .andExpect(jsonPath("$.resultData.scenarios[0].name").value("s1"));
    }

    @Test
    void patchReturns404ForOtherUsersReport() throws Exception {
        RegisteredUser alice = registerRandomUser();
        RegisteredUser bob = registerRandomUser();
        UUID alicesReport = createReport(alice, "Alice only");

        mockMvc.perform(patch("/api/reports/" + alicesReport)
                        .header("Authorization", bob.bearer())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("title", "Stolen"))))
                .andExpect(status().isNotFound());
    }

    @Test
    void patchRequiresAuthentication() throws Exception {
        mockMvc.perform(patch("/api/reports/" + UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("title", "x"))))
                .andExpect(status().isForbidden());
    }

    @Test
    void deleteRemovesReport() throws Exception {
        RegisteredUser user = registerRandomUser();
        UUID id = createReport(user, "To delete");

        mockMvc.perform(delete("/api/reports/" + id).header("Authorization", user.bearer()))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/reports/" + id).header("Authorization", user.bearer()))
                .andExpect(status().isNotFound());
    }

    @Test
    void deleteReturns404ForOtherUsersReport() throws Exception {
        RegisteredUser alice = registerRandomUser();
        RegisteredUser bob = registerRandomUser();
        UUID alicesReport = createReport(alice, "Alice only");

        mockMvc.perform(delete("/api/reports/" + alicesReport).header("Authorization", bob.bearer()))
                .andExpect(status().isNotFound());

        // And the report is still there for Alice.
        mockMvc.perform(get("/api/reports/" + alicesReport).header("Authorization", alice.bearer()))
                .andExpect(status().isOk());
    }

    @Test
    void deleteRequiresAuthentication() throws Exception {
        mockMvc.perform(delete("/api/reports/" + UUID.randomUUID())).andExpect(status().isForbidden());
    }

    private UUID createReport(RegisteredUser user, String title) throws Exception {
        Map<String, Object> body = Map.of("title", title, "inputData", Map.of("seed", title));
        MvcResult result = mockMvc.perform(post("/api/reports")
                        .header("Authorization", user.bearer())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn();
        JsonNode json = objectMapper.readTree(result.getResponse().getContentAsString());
        return UUID.fromString(json.get("id").asText());
    }
}
