package com.foresight.backend.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Duration;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.foresight.backend.ai.dto.AnalyzeRequest;
import com.foresight.backend.ai.dto.GlobalSteepRequest;
import com.foresight.backend.ai.dto.HorizonSuggestRequest;
import com.foresight.backend.ai.dto.SteepSuggestRequest;
import com.foresight.backend.analytics.LlmCapture;

import java.util.Optional;
import reactor.core.publisher.Mono;

@ExtendWith(MockitoExtension.class)
class AiServiceTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Mock
    private AnthropicClient anthropicClient;

    private AiService aiService;

    @BeforeEach
    void setup() {
        // The AnthropicClient signatures take a `model` parameter as their
        // first arg (per-tier dispatch). We construct a real properties
        // record with marker tier IDs so the AiService picks them up — the
        // tests only verify that the call shape matches, not the specific
        // tier (the per-call tier mapping is straightforward and is best
        // covered by reading the AiService source rather than by mocking).
        AnthropicProperties.Models models =
                new AnthropicProperties.Models("test-haiku", "test-sonnet", "test-opus");
        AnthropicProperties props = new AnthropicProperties(
                "test-key",
                "https://api.anthropic.test",
                "test-default",
                models,
                "2023-06-01",
                Duration.ofSeconds(10),
                Duration.ofSeconds(60),
                3,
                Duration.ofSeconds(5));
        // No-op LlmCapture wired with an empty Optional so $ai_generation events are
        // simply skipped — the AI flow shape is what's under test here, not analytics.
        LlmCapture llmCapture = new LlmCapture(Optional.empty());
        aiService = new AiService(anthropicClient, MAPPER, props, llmCapture);
    }

    @Test
    void suggestSteepBuildsPromptAndUsesCorrectBudget() throws Exception {
        JsonNode expected = MAPPER.readTree("{\"factors\":[]}");
        when(anthropicClient.sendMessage(anyString(), anyString(), anyString(), eq(700)))
                .thenReturn(Mono.just(expected));

        JsonNode result = aiService
                .suggestSteep(new SteepSuggestRequest("technological", "Acme Corp", "en"))
                .block();

        ArgumentCaptor<String> systemCaptor = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> promptCaptor = ArgumentCaptor.forClass(String.class);
        verify(anthropicClient)
                .sendMessage(anyString(), systemCaptor.capture(), promptCaptor.capture(), eq(700));

        assertThat(systemCaptor.getValue()).contains("STEEP dimension");
        assertThat(promptCaptor.getValue())
                .contains("Language: en")
                .contains("Dimension: technological")
                .contains("Acme Corp");
        assertThat(result).isEqualTo(expected);
    }

    @Test
    void suggestSteepDefaultsLanguageToSpanishWhenNull() throws Exception {
        when(anthropicClient.sendMessage(anyString(), anyString(), anyString(), eq(700)))
                .thenReturn(Mono.just(MAPPER.readTree("{\"factors\":[]}")));

        aiService.suggestSteep(new SteepSuggestRequest("social", "Acme", null)).block();

        ArgumentCaptor<String> promptCaptor = ArgumentCaptor.forClass(String.class);
        verify(anthropicClient)
                .sendMessage(anyString(), anyString(), promptCaptor.capture(), eq(700));

        assertThat(promptCaptor.getValue()).contains("Language: es");
    }

    @Test
    void suggestHorizonUsesHorizonSystemPromptAndBudget() throws Exception {
        JsonNode expected = MAPPER.readTree("{\"signals\":[]}");
        when(anthropicClient.sendMessage(anyString(), anyString(), anyString(), eq(800)))
                .thenReturn(Mono.just(expected));

        aiService
                .suggestHorizon(new HorizonSuggestRequest("H2", "Acme Corp", null))
                .block();

        ArgumentCaptor<String> systemCaptor = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> promptCaptor = ArgumentCaptor.forClass(String.class);
        verify(anthropicClient)
                .sendMessage(anyString(), systemCaptor.capture(), promptCaptor.capture(), eq(800));

        assertThat(systemCaptor.getValue()).contains("Horizon Scanning");
        assertThat(promptCaptor.getValue()).contains("Language: es").contains("Horizon: H2");
    }

    @Test
    void globalSteepCallsWebSearchVariantWithSectorAndYear() throws Exception {
        JsonNode expected = MAPPER.readTree("{\"S\":\"\",\"T\":\"\",\"E\":\"\",\"ENV\":\"\",\"P\":\"\"}");
        when(anthropicClient.sendMessageWithWebSearch(anyString(), anyString(), anyString(), eq(1500)))
                .thenReturn(Mono.just(expected));

        aiService
                .globalSteep(new GlobalSteepRequest("Movilidad eléctrica", "en", null))
                .block();

        ArgumentCaptor<String> systemCaptor = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> promptCaptor = ArgumentCaptor.forClass(String.class);
        verify(anthropicClient)
                .sendMessageWithWebSearch(
                        anyString(), systemCaptor.capture(), promptCaptor.capture(), eq(1500));

        assertThat(systemCaptor.getValue()).contains("web_search");
        assertThat(promptCaptor.getValue())
                .contains("Language: en")
                .contains("Sector: Movilidad eléctrica")
                .contains("Current year:")
                .doesNotContain("Return ONLY the");
    }

    @Test
    void globalSteepWithDimensionPinsPromptToSingleKey() throws Exception {
        JsonNode expected = MAPPER.readTree("{\"P\":\"some political signal\"}");
        when(anthropicClient.sendMessageWithWebSearch(anyString(), anyString(), anyString(), eq(1500)))
                .thenReturn(Mono.just(expected));

        aiService
                .globalSteep(new GlobalSteepRequest("Movilidad eléctrica", "es", "P"))
                .block();

        ArgumentCaptor<String> promptCaptor = ArgumentCaptor.forClass(String.class);
        verify(anthropicClient)
                .sendMessageWithWebSearch(
                        anyString(), anyString(), promptCaptor.capture(), eq(1500));

        assertThat(promptCaptor.getValue())
                .contains("Sector: Movilidad eléctrica")
                .contains("Return ONLY the \"P\" key")
                .contains("{\"P\":\"...\"}");
    }

    @Test
    void analyzeUsesLargeTokenBudgetAndIncludesAllSections() throws Exception {
        JsonNode companyProfile = MAPPER.readTree("{\"name\":\"Acme\"}");
        JsonNode steep = MAPPER.readTree("{\"technological\":[]}");
        JsonNode horizon = MAPPER.readTree("{\"H1\":[]}");
        JsonNode expected = MAPPER.readTree("{\"report\":{}}");

        when(anthropicClient.sendMessage(anyString(), anyString(), anyString(), eq(16000)))
                .thenReturn(Mono.just(expected));

        aiService
                .analyze(new AnalyzeRequest(companyProfile, steep, horizon, null, "en"))
                .block();

        // First arg is the model id (per the new per-tier signature) — we
        // don't assert on it here, the tier mapping is read directly from
        // AiService; this test just confirms the prompt body contents
        // reach the client unchanged.
        ArgumentCaptor<String> promptCaptor = ArgumentCaptor.forClass(String.class);
        verify(anthropicClient)
                .sendMessage(anyString(), anyString(), promptCaptor.capture(), eq(16000));

        String prompt = promptCaptor.getValue();
        assertThat(prompt)
                .contains("Acme")
                .contains("technological")
                .contains("H1")
                .contains("Language: en");
    }
}
