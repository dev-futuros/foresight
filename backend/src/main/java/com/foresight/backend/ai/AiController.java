package com.foresight.backend.ai;

import jakarta.validation.Valid;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.fasterxml.jackson.databind.JsonNode;
import com.foresight.backend.ai.dto.AnalyzeContextRequest;
import com.foresight.backend.ai.dto.AnalyzeRequest;
import com.foresight.backend.ai.dto.ChatRequest;
import com.foresight.backend.ai.dto.GlobalSteepRequest;
import com.foresight.backend.ai.dto.HorizonSuggestRequest;
import com.foresight.backend.ai.dto.SteepSuggestRequest;

import lombok.RequiredArgsConstructor;
import reactor.core.publisher.Mono;

/**
 * REST endpoints that proxy Claude AI calls on behalf of the authenticated user.
 *
 * <p>All AI calls are proxied server-side so the Anthropic API key never reaches the browser.
 * Responses are returned as raw {@link JsonNode} — the frontend renders them directly.
 *
 * <p>Endpoints return {@link Mono} so Spring MVC's async dispatching propagates client
 * disconnects all the way to the upstream Anthropic call: when the user closes the tab or
 * navigates away, the response Mono is cancelled, reactor-netty closes the socket to
 * Anthropic, and token generation stops. The synchronous {@code .block()} flow we used
 * earlier kept the upstream call alive even after the client disappeared, which made
 * abuse via "fire and forget" requests effectively free for the attacker.
 */
@RestController
@RequestMapping("/api/ai")
@RequiredArgsConstructor
public class AiController {

    private final AiService aiService;

    /**
     * Generates a current global STEEP briefing for the given sector, grounded on live
     * web search results. The response may contain interleaved {@code tool_use}/
     * {@code tool_result} blocks alongside the {@code text} blocks; the frontend extracts
     * the text and parses the JSON.
     *
     * @param request validated request payload (sector, language)
     * @return raw JSON from Claude with macro signals per STEEP dimension
     */
    @PostMapping("/global-steep")
    public Mono<JsonNode> globalSteep(@Valid @RequestBody GlobalSteepRequest request) {
        return aiService.globalSteep(request);
    }

    /**
     * Suggests high-impact STEEP factors for a given dimension and company profile.
     *
     * @param request validated STEEP suggestion payload (dimension, company profile, language)
     * @return raw JSON from Claude containing a {@code factors} array
     */
    @PostMapping("/suggest-steep")
    public Mono<JsonNode> suggestSteep(@Valid @RequestBody SteepSuggestRequest request) {
        return aiService.suggestSteep(request);
    }

    /**
     * Suggests horizon-scanning signals (H1/H2/H3) for a company profile.
     *
     * @param request validated horizon suggestion payload (horizon, company profile, language)
     * @return raw JSON from Claude containing a {@code signals} array
     */
    @PostMapping("/suggest-horizon")
    public Mono<JsonNode> suggestHorizon(@Valid @RequestBody HorizonSuggestRequest request) {
        return aiService.suggestHorizon(request);
    }

    /**
     * Produces a comprehensive foresight analysis (3P scenarios, 2x2 matrix, backcasting, etc.)
     * given company profile, STEEP, and horizon inputs.
     *
     * @param request validated analysis payload
     * @return raw JSON report from Claude
     */
    @PostMapping("/analyze")
    public Mono<JsonNode> analyze(@Valid @RequestBody AnalyzeRequest request) {
        return aiService.analyze(request);
    }

    /**
     * Second pass — driving forces, critical-uncertainty axes, impact matrix placements
     * and narrative logic per scenario. Anchored on the scenarios produced by /analyze.
     *
     * <p>Split from {@link #analyze} to keep each pass under {@code max_tokens}: an earlier
     * iteration tried to emit all of these inside a single response and got truncated
     * mid-JSON. See the comment on {@code ANALYZE_SYSTEM} in {@link AiService}.
     */
    @PostMapping("/analyze/scenario-planning")
    public Mono<JsonNode> scenarioPlanning(@Valid @RequestBody AnalyzeContextRequest request) {
        return aiService.scenarioPlanning(request);
    }

    /** Third pass — backcasting panels per scenario. */
    @PostMapping("/analyze/backcasting")
    public Mono<JsonNode> backcasting(@Valid @RequestBody AnalyzeContextRequest request) {
        return aiService.backcasting(request);
    }

    /** Fourth pass — strategic priorities by horizon (H1/H2/H3). */
    @PostMapping("/analyze/strategic-map")
    public Mono<JsonNode> strategicMap(@Valid @RequestBody AnalyzeContextRequest request) {
        return aiService.strategicMap(request);
    }

    /** Fifth pass — public web sources that ground the analysis (uses web_search). */
    @PostMapping("/analyze/sources")
    public Mono<JsonNode> sources(@Valid @RequestBody AnalyzeContextRequest request) {
        return aiService.sources(request);
    }

    /**
     * Chat assistant endpoint. Stateless: the caller sends the full conversation
     * history every turn and the backend forwards it to Anthropic with the foresight
     * system prompt + the assistant tool catalogue ({@link AssistantTools}). The raw
     * Anthropic response is returned verbatim so the frontend can iterate
     * {@code content} blocks looking for {@code text} and {@code tool_use}.
     *
     * <p>Tool execution happens on the frontend (the tools act on the wizard / app
     * state). After running each tool, the frontend appends the {@code tool_result}
     * blocks to its history and re-calls this endpoint to get the next assistant turn.
     */
    @PostMapping("/chat")
    public Mono<JsonNode> chat(@Valid @RequestBody ChatRequest request) {
        return aiService.chat(request);
    }
}
