package com.foresight.backend.ai;

import jakarta.validation.Valid;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.fasterxml.jackson.databind.JsonNode;
import com.foresight.backend.ai.dto.AnalyzeRequest;
import com.foresight.backend.ai.dto.GlobalSteepRequest;
import com.foresight.backend.ai.dto.HorizonSuggestRequest;
import com.foresight.backend.ai.dto.SteepSuggestRequest;

import lombok.RequiredArgsConstructor;

/**
 * REST endpoints that proxy Claude AI calls on behalf of the authenticated user.
 *
 * <p>All AI calls are proxied server-side so the Anthropic API key never reaches the browser.
 * Responses are returned as raw {@link JsonNode} — the frontend renders them directly.
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
    public JsonNode globalSteep(@Valid @RequestBody GlobalSteepRequest request) {
        return aiService.globalSteep(request);
    }

    /**
     * Suggests high-impact STEEP factors for a given dimension and company profile.
     *
     * @param request validated STEEP suggestion payload (dimension, company profile, language)
     * @return raw JSON from Claude containing a {@code factors} array
     */
    @PostMapping("/suggest-steep")
    public JsonNode suggestSteep(@Valid @RequestBody SteepSuggestRequest request) {
        return aiService.suggestSteep(request);
    }

    /**
     * Suggests horizon-scanning signals (H1/H2/H3) for a company profile.
     *
     * @param request validated horizon suggestion payload (horizon, company profile, language)
     * @return raw JSON from Claude containing a {@code signals} array
     */
    @PostMapping("/suggest-horizon")
    public JsonNode suggestHorizon(@Valid @RequestBody HorizonSuggestRequest request) {
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
    public JsonNode analyze(@Valid @RequestBody AnalyzeRequest request) {
        return aiService.analyze(request);
    }
}
