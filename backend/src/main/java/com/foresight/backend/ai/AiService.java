package com.foresight.backend.ai;

import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.JsonNode;
import com.foresight.backend.ai.dto.AnalyzeRequest;
import com.foresight.backend.ai.dto.GlobalSteepRequest;
import com.foresight.backend.ai.dto.HorizonSuggestRequest;
import com.foresight.backend.ai.dto.SteepSuggestRequest;

import lombok.RequiredArgsConstructor;
import reactor.core.publisher.Mono;

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

    /**
     * System prompt for the global STEEP briefing. Asks Claude to ground the answer on live
     * web search data and force a strict JSON shape so the frontend can map straight to fields.
     */
    private static final String GLOBAL_STEEP_SYSTEM =
            """
            You are an expert in strategic foresight and macro analysis. Use the web_search tool
            to gather real, current data on the global environment (active geopolitical conflicts,
            commodity prices, trade tensions, AI regulation, supply chain disruptions, inflation,
            interest rates, climate policy) that is relevant for the requested sector.

            Respond ONLY with a JSON object — no prose, no backticks, no preamble — with this
            exact shape, where every value is a single string of 2-3 concrete and current trends:
            {"S":"...","T":"...","E":"...","ENV":"...","P":"..."}
            S = social, T = technological, E = economic, ENV = environmental, P = political.
            Respond in the requested language.
            """;

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

    /**
     * System prompt for the full foresight analysis pass.
     *
     * <p>Pins the output to the exact flat schema the frontend renders today
     * ({@code scenarios}, {@code keyUncertainties}, {@code weakSignals},
     * {@code wildcards}). Earlier iterations of this prompt left the structure
     * open-ended and the model would emit deeply nested narrative ({@code
     * executiveSummary}, {@code matrix2x2}, multi-year {@code backcasting} per
     * scenario…) that consumed all 8000 max_tokens and got truncated mid-JSON.
     */
    private static final String ANALYZE_SYSTEM =
            """
            You are a strategic foresight expert. Given a company profile, STEEP factors, and
            horizon signals, produce a concise foresight report.

            Respond ONLY with a single JSON object that matches EXACTLY this shape — no
            additional fields, no nested narrative, no markdown, no preamble:

            {
              "scenarios": [
                {"type": "Probable",  "title": "...", "description": "..."},
                {"type": "Plausible", "title": "...", "description": "..."},
                {"type": "Possible",  "title": "...", "description": "..."}
              ],
              "keyUncertainties": ["...", "...", "..."],
              "weakSignals":      ["...", "...", "..."],
              "wildcards":        ["...", "..."]
            }

            Constraints:
            - Exactly 3 scenarios, in this order: Probable, Plausible, Possible.
            - Each scenario description: 2-4 sentences, no nested objects, no bullet points.
            - 3-5 items per array (keyUncertainties / weakSignals / wildcards), each a single sentence.
            - No extra top-level keys. No prose outside the JSON.
            - Respond in the requested language.
            """;

    private final AnthropicClient anthropicClient;

    /**
     * Generates a current global STEEP briefing for a given sector, grounded on live web
     * search results. The frontend uses this to pre-fill the macro panel of the wizard.
     *
     * @param request validated request carrying the sector and language
     * @return Claude's raw JSON reply (expected shape: {@code {"S":..., "T":..., ...}})
     */
    public Mono<JsonNode> globalSteep(GlobalSteepRequest request) {
        String prompt = "Language: %s\nSector: %s\nCurrent year: %d"
                .formatted(
                        lang(request.language()),
                        request.sector(),
                        java.time.Year.now().getValue());
        if (request.dimension() != null) {
            // Single-dimension regeneration. Pin the model to the exact JSON shape
            // expected by the frontend so we don't leak unwanted keys.
            prompt += "\n\nReturn ONLY the \"%s\" key. Output exactly: {\"%s\":\"...\"}"
                    .formatted(request.dimension(), request.dimension());
        }
        return anthropicClient
                .sendMessageWithWebSearch(GLOBAL_STEEP_SYSTEM, prompt, 1500)
                .map(AiResponseSanitizer::sanitize);
    }

    /**
     * Suggests STEEP factors for one dimension.
     *
     * @param request validated request carrying dimension, company profile, and language
     * @return Claude's raw JSON reply (expected shape: {@code {"factors": [...]}})
     */
    public Mono<JsonNode> suggestSteep(SteepSuggestRequest request) {
        String prompt = "Language: %s\nDimension: %s\nCompany profile:\n%s"
                .formatted(lang(request.language()), request.dimension(), request.companyProfile());
        return anthropicClient.sendMessage(STEEP_SYSTEM, prompt, 700).map(AiResponseSanitizer::sanitize);
    }

    /**
     * Suggests signals for a given horizon (H1/H2/H3).
     *
     * @param request validated request carrying horizon, company profile, and language
     * @return Claude's raw JSON reply (expected shape: {@code {"signals": [...]}})
     */
    public Mono<JsonNode> suggestHorizon(HorizonSuggestRequest request) {
        String prompt = "Language: %s\nHorizon: %s\nCompany profile:\n%s"
                .formatted(lang(request.language()), request.horizon(), request.companyProfile());
        return anthropicClient.sendMessage(HORIZON_SYSTEM, prompt, 800).map(AiResponseSanitizer::sanitize);
    }

    /**
     * Produces a full foresight analysis given company profile + STEEP + horizon inputs.
     *
     * <p>The schema is intentionally flat (see {@link #ANALYZE_SYSTEM}) so the response fits
     * comfortably below the {@code max_tokens} ceiling. The 16000 budget is a safety margin —
     * a well-formed response is typically ~2-4k tokens.
     *
     * @param request validated request carrying all three JSON sections and the language
     * @return Claude's raw JSON foresight report
     */
    public Mono<JsonNode> analyze(AnalyzeRequest request) {
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
        return anthropicClient.sendMessage(ANALYZE_SYSTEM, prompt, 16000).map(AiResponseSanitizer::sanitize);
    }

    /**
     * Normalizes the language hint to either {@code "en"} or {@code "es"} (default).
     *
     * @param language raw language tag from the request (may be {@code null})
     * @return {@code "en"} if explicitly English, otherwise {@code "es"}
     */
    private String lang(String language) {
        return (language != null && language.equals("en")) ? "en" : "es";
    }
}
