package com.foresight.backend.ai;

import jakarta.validation.Valid;

import org.springframework.http.MediaType;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.fasterxml.jackson.databind.JsonNode;
import com.foresight.backend.ai.dto.AnalyzeContextRequest;
import com.foresight.backend.ai.dto.AnalyzeRequest;
import com.foresight.backend.ai.dto.ChatRequest;
import com.foresight.backend.ai.dto.GlobalSteepDimRequest;
import com.foresight.backend.ai.dto.GlobalSteepRequest;
import com.foresight.backend.ai.dto.HorizonSuggestRequest;
import com.foresight.backend.ai.dto.SteepSuggestRequest;

import lombok.RequiredArgsConstructor;
import reactor.core.publisher.Flux;
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
     * Phase 1 of the split Global STEEP flow — streamed. Emits the same
     * {@code {type:"progress",chars,sources} / {type:"done",text,citations}}
     * SSE shape as the analyze endpoints so the Step 2 loader can tick
     * the "sources consulted" counter for the scan row in real time.
     */
    @PostMapping(value = "/global-steep-scan", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ServerSentEvent<JsonNode>> globalSteepScan(@Valid @RequestBody GlobalSteepRequest request) {
        return wrapSse(aiService.globalSteepScanStream(request));
    }

    /**
     * Phase 2 of the split Global STEEP flow — streamed per-dimension
     * reformulation. No web_search, so the {@code sources} counter stays
     * at zero; the loader displays raw characters for these rows
     * instead. The {@code done} event's {@code text} is plain prose, not
     * JSON — the frontend uses it verbatim.
     */
    @PostMapping(value = "/global-steep-dim", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ServerSentEvent<JsonNode>> globalSteepDim(@Valid @RequestBody GlobalSteepDimRequest request) {
        return wrapSse(aiService.globalSteepDimStream(request));
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
     * Up-front research pass — single web_search-enabled call that
     * gathers dated facts for the whole report. The frontend runs this
     * before the 5 parallel section calls, then folds the {@code text}
     * of the {@code done} event into each section's request as the
     * {@code research} field. This mirrors the Global STEEP scan-then-
     * reformulate pattern and cuts total web_search budget by ~5×.
     *
     * <p>Same SSE event shape as the section endpoints
     * ({@code progress} / {@code done}), so the loader can reuse its
     * existing row rendering.
     */
    @PostMapping(value = "/analyze/scan", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ServerSentEvent<JsonNode>> analyzeScan(@Valid @RequestBody AnalyzeRequest request) {
        return wrapSse(aiService.analyzeScanStream(request));
    }

    /**
     * Phase A of the parallel-5 analysis flow — summary block
     * (executiveSummary, keyUncertainties, weakSignals, wildcards). The
     * endpoint streams progress as Server-Sent Events: each event carries a
     * tiny JSON payload (either {@code {"type":"progress","chars":…,"sources":…}}
     * during generation or a final {@code {"type":"done","text":"…","citations":[…]}}).
     * The frontend's loader rows tick the chars/sources counters from
     * these events in real time.
     */
    @PostMapping(value = "/analyze/summary", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ServerSentEvent<JsonNode>> analyzeSummary(@Valid @RequestBody AnalyzeRequest request) {
        return wrapSse(aiService.analyzeSummaryStream(request));
    }

    /** Phase B — streamed 3P scenarios. See {@link #analyzeSummary} for the event shape. */
    @PostMapping(value = "/analyze/scenarios", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ServerSentEvent<JsonNode>> analyzeScenarios(@Valid @RequestBody AnalyzeRequest request) {
        return wrapSse(aiService.analyzeScenariosStream(request));
    }

    /**
     * Section C — streamed scenario planning structure (driving forces,
     * critical-uncertainty axes, narrative logics). Same SSE event shape
     * as {@link #analyzeSummary}.
     */
    @PostMapping(value = "/analyze/scenario-planning", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ServerSentEvent<JsonNode>> scenarioPlanning(@Valid @RequestBody AnalyzeContextRequest request) {
        return wrapSse(aiService.scenarioPlanningStream(request));
    }

    /** Section E — streamed backcasting trajectories. */
    @PostMapping(value = "/analyze/backcasting", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ServerSentEvent<JsonNode>> backcasting(@Valid @RequestBody AnalyzeContextRequest request) {
        return wrapSse(aiService.backcastingStream(request));
    }

    /** Section D — streamed strategic priorities by horizon (H1/H2/H3). */
    @PostMapping(value = "/analyze/strategic-map", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ServerSentEvent<JsonNode>> strategicMap(@Valid @RequestBody AnalyzeContextRequest request) {
        return wrapSse(aiService.strategicMapStream(request));
    }

    /**
     * Boxes a {@code Flux<JsonNode>} into a {@code Flux<ServerSentEvent<JsonNode>>}
     * so Spring's SSE writer can serialize it. We don't set the event
     * name — the data envelope already carries a {@code type} field that
     * the frontend dispatches on.
     */
    private static Flux<ServerSentEvent<JsonNode>> wrapSse(Flux<JsonNode> source) {
        return source.map(json -> ServerSentEvent.<JsonNode>builder().data(json).build());
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

    /**
     * Streaming variant of {@code /chat}. Emits an SSE flux of
     * {@code {"type":"delta","text":"…"}} events as the model generates,
     * then a final {@code {"type":"done","text":"…"}} carrying the
     * full assembled response. Used by the chat panel so the user sees
     * text appearing word-by-word; matches the demo's chat UX.
     */
    @PostMapping(value = "/chat/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ServerSentEvent<JsonNode>> chatStream(@Valid @RequestBody ChatRequest request) {
        return wrapSse(aiService.chatStream(request));
    }
}
