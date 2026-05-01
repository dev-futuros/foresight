package com.foresight.backend.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.foresight.backend.ai.dto.AnalyzeRequest;
import com.foresight.backend.ai.dto.GlobalSteepRequest;
import com.foresight.backend.ai.dto.HorizonSuggestRequest;
import com.foresight.backend.ai.dto.SteepSuggestRequest;

import reactor.core.publisher.Mono;

@ExtendWith(MockitoExtension.class)
class AiServiceTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Mock
    private AnthropicClient anthropicClient;

    @InjectMocks
    private AiService aiService;

    @Test
    void suggestSteepBuildsPromptAndUsesCorrectBudget() throws Exception {
        JsonNode expected = MAPPER.readTree("{\"factors\":[]}");
        when(anthropicClient.sendMessage(
                        org.mockito.ArgumentMatchers.anyString(),
                        org.mockito.ArgumentMatchers.anyString(),
                        org.mockito.ArgumentMatchers.eq(700)))
                .thenReturn(Mono.just(expected));

        JsonNode result = aiService
                .suggestSteep(new SteepSuggestRequest("technological", "Acme Corp", "en"))
                .block();

        ArgumentCaptor<String> systemCaptor = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> promptCaptor = ArgumentCaptor.forClass(String.class);
        verify(anthropicClient)
                .sendMessage(systemCaptor.capture(), promptCaptor.capture(), org.mockito.ArgumentMatchers.eq(700));

        assertThat(systemCaptor.getValue()).contains("STEEP dimension");
        assertThat(promptCaptor.getValue())
                .contains("Language: en")
                .contains("Dimension: technological")
                .contains("Acme Corp");
        assertThat(result).isEqualTo(expected);
    }

    @Test
    void suggestSteepDefaultsLanguageToSpanishWhenNull() throws Exception {
        when(anthropicClient.sendMessage(
                        org.mockito.ArgumentMatchers.anyString(),
                        org.mockito.ArgumentMatchers.anyString(),
                        org.mockito.ArgumentMatchers.eq(700)))
                .thenReturn(Mono.just(MAPPER.readTree("{\"factors\":[]}")));

        aiService.suggestSteep(new SteepSuggestRequest("social", "Acme", null)).block();

        ArgumentCaptor<String> promptCaptor = ArgumentCaptor.forClass(String.class);
        verify(anthropicClient)
                .sendMessage(
                        org.mockito.ArgumentMatchers.anyString(),
                        promptCaptor.capture(),
                        org.mockito.ArgumentMatchers.eq(700));

        assertThat(promptCaptor.getValue()).contains("Language: es");
    }

    @Test
    void suggestHorizonUsesHorizonSystemPromptAndBudget() throws Exception {
        JsonNode expected = MAPPER.readTree("{\"signals\":[]}");
        when(anthropicClient.sendMessage(
                        org.mockito.ArgumentMatchers.anyString(),
                        org.mockito.ArgumentMatchers.anyString(),
                        org.mockito.ArgumentMatchers.eq(800)))
                .thenReturn(Mono.just(expected));

        aiService.suggestHorizon(new HorizonSuggestRequest("H2", "Acme Corp", null)).block();

        ArgumentCaptor<String> systemCaptor = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> promptCaptor = ArgumentCaptor.forClass(String.class);
        verify(anthropicClient)
                .sendMessage(systemCaptor.capture(), promptCaptor.capture(), org.mockito.ArgumentMatchers.eq(800));

        assertThat(systemCaptor.getValue()).contains("Horizon Scanning");
        assertThat(promptCaptor.getValue()).contains("Language: es").contains("Horizon: H2");
    }

    @Test
    void globalSteepCallsWebSearchVariantWithSectorAndYear() throws Exception {
        JsonNode expected = MAPPER.readTree("{\"S\":\"\",\"T\":\"\",\"E\":\"\",\"ENV\":\"\",\"P\":\"\"}");
        when(anthropicClient.sendMessageWithWebSearch(
                        org.mockito.ArgumentMatchers.anyString(),
                        org.mockito.ArgumentMatchers.anyString(),
                        org.mockito.ArgumentMatchers.eq(1500)))
                .thenReturn(Mono.just(expected));

        aiService.globalSteep(new GlobalSteepRequest("Movilidad eléctrica", "en", null)).block();

        ArgumentCaptor<String> systemCaptor = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> promptCaptor = ArgumentCaptor.forClass(String.class);
        verify(anthropicClient)
                .sendMessageWithWebSearch(
                        systemCaptor.capture(), promptCaptor.capture(), org.mockito.ArgumentMatchers.eq(1500));

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
        when(anthropicClient.sendMessageWithWebSearch(
                        org.mockito.ArgumentMatchers.anyString(),
                        org.mockito.ArgumentMatchers.anyString(),
                        org.mockito.ArgumentMatchers.eq(1500)))
                .thenReturn(Mono.just(expected));

        aiService.globalSteep(new GlobalSteepRequest("Movilidad eléctrica", "es", "P")).block();

        ArgumentCaptor<String> promptCaptor = ArgumentCaptor.forClass(String.class);
        verify(anthropicClient)
                .sendMessageWithWebSearch(
                        org.mockito.ArgumentMatchers.anyString(),
                        promptCaptor.capture(),
                        org.mockito.ArgumentMatchers.eq(1500));

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

        when(anthropicClient.sendMessage(
                        org.mockito.ArgumentMatchers.anyString(),
                        org.mockito.ArgumentMatchers.anyString(),
                        org.mockito.ArgumentMatchers.eq(16000)))
                .thenReturn(Mono.just(expected));

        aiService.analyze(new AnalyzeRequest(companyProfile, steep, horizon, "en")).block();

        ArgumentCaptor<String> promptCaptor = ArgumentCaptor.forClass(String.class);
        verify(anthropicClient)
                .sendMessage(
                        org.mockito.ArgumentMatchers.anyString(),
                        promptCaptor.capture(),
                        org.mockito.ArgumentMatchers.eq(16000));

        String prompt = promptCaptor.getValue();
        assertThat(prompt)
                .contains("Acme")
                .contains("technological")
                .contains("H1")
                .contains("Language: en");
    }
}
