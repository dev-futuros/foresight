package com.foresight.backend.ai;

import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.JsonNode;
import com.foresight.backend.ai.dto.AnalyzeRequest;
import com.foresight.backend.ai.dto.HorizonSuggestRequest;
import com.foresight.backend.ai.dto.SteepSuggestRequest;

import lombok.RequiredArgsConstructor;

/**
 * Orchestrates prompt construction and Claude invocation for the foresight workflows.
 *
 * <p>System prompts live here as constants so they can evolve without touching the transport
 * layer ({@link AnthropicClient}). Each public method corresponds to one user-facing AI feature
 * and specifies its own {@code max_tokens} budget.
 */
@Service
@RequiredArgsConstructor
public class AiService {

    /** System prompt for STEEP factor suggestions. Forces JSON-only output. */
    private static final String STEEP_SYSTEM =
            """
            You are a strategic foresight expert. Given a company profile and a STEEP dimension,
            suggest 3-5 concise, high-impact factors that should be considered in a scenario analysis.
            Respond ONLY with a JSON object: {"factors": [{"title": "...", "description": "..."}]}.
            Respond in the requested language.
            """;

    /** System prompt for horizon scanning (H1/H2/H3) signal suggestions. */
    private static final String HORIZON_SYSTEM =
            """
            You are a strategic foresight expert specialized in Horizon Scanning.
            H1 = present signals (0-2 years), H2 = emerging (2-5 years), H3 = possible futures (5+ years).
            Suggest 3-5 relevant signals for the given horizon and company.
            Respond ONLY with a JSON object: {"signals": [{"title": "...", "description": "..."}]}.
            Respond in the requested language.
            """;

    /** System prompt for the full foresight analysis pass. */
    private static final String ANALYZE_SYSTEM =
            """
            You are a strategic foresight expert. Given company profile, STEEP factors, and horizon signals,
            produce a comprehensive foresight report covering: executive summary, 3P scenarios (probable/plausible/possible),
            scenario planning (2x2 matrix), backcasting per scenario, weak signals, wildcards, and strategic priorities (H1/H2/H3).
            Respond ONLY with a valid JSON object matching the expected schema. Respond in the requested language.
            """;

    private final AnthropicClient anthropicClient;

    /**
     * Suggests STEEP factors for one dimension.
     *
     * @param request validated request carrying dimension, company profile, and language
     * @return Claude's raw JSON reply (expected shape: {@code {"factors": [...]}})
     */
    public JsonNode suggestSteep(SteepSuggestRequest request) {
        String prompt = "Language: %s\nDimension: %s\nCompany profile:\n%s"
                .formatted(lang(request.language()), request.dimension(), request.companyProfile());
        return anthropicClient.sendMessage(STEEP_SYSTEM, prompt, 700);
    }

    /**
     * Suggests signals for a given horizon (H1/H2/H3).
     *
     * @param request validated request carrying horizon, company profile, and language
     * @return Claude's raw JSON reply (expected shape: {@code {"signals": [...]}})
     */
    public JsonNode suggestHorizon(HorizonSuggestRequest request) {
        String prompt = "Language: %s\nHorizon: %s\nCompany profile:\n%s"
                .formatted(lang(request.language()), request.horizon(), request.companyProfile());
        return anthropicClient.sendMessage(HORIZON_SYSTEM, prompt, 800);
    }

    /**
     * Produces a full foresight analysis given company profile + STEEP + horizon inputs.
     *
     * <p>Uses a generous {@code max_tokens} budget (8000) because the output is a full report.
     *
     * @param request validated request carrying all three JSON sections and the language
     * @return Claude's raw JSON foresight report
     */
    public JsonNode analyze(AnalyzeRequest request) {
        String prompt =
                """
                Language: %s
                Company profile: %s
                STEEP analysis: %s
                Horizon signals: %s
                """
                        .formatted(
                                lang(request.language()),
                                request.companyProfile().toString(),
                                request.steep().toString(),
                                request.horizon().toString());
        return anthropicClient.sendMessage(ANALYZE_SYSTEM, prompt, 8000);
    }

    /**
     * Normalises the language hint to either {@code "en"} or {@code "es"} (default).
     *
     * @param language raw language tag from the request (may be {@code null})
     * @return {@code "en"} if explicitly English, otherwise {@code "es"}
     */
    private String lang(String language) {
        return (language != null && language.equals("en")) ? "en" : "es";
    }
}
