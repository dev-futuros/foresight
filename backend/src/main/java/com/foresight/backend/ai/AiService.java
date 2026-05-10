package com.foresight.backend.ai;

import org.springframework.stereotype.Service;

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

    /**
     * System prompt for the scenario-planning pass: driving forces, critical-uncertainty
     * axes, an impact-matrix placement for each force, and the narrative logic per scenario.
     *
     * <p>This is the second leg of the split-analysis flow. Sized so that all three sub-payloads
     * fit comfortably below {@code max_tokens} on its own — splitting was specifically to avoid
     * the historical truncation issue documented on {@link #ANALYZE_SYSTEM}.
     */
    private static final String SCENARIO_PLANNING_SYSTEM =
            """
            You are a strategic foresight expert in the GBN scenario-planning method.

            Given the inputs (company profile, STEEP, horizon signals, and the three scenarios
            already chosen), respond ONLY with a single JSON object matching EXACTLY:

            {
              "forces": [
                {"title": "...", "description": "...", "impact": "low|medium|high", "uncertainty": "low|medium|high"}
              ],
              "axes": [
                {"name": "...", "negative": "...", "positive": "..."},
                {"name": "...", "negative": "...", "positive": "..."}
              ],
              "impactMatrix": [
                {"force": "force title here", "x": -1.0, "y": -1.0}
              ],
              "narrativeLogics": [
                {"scenarioType": "Probable",  "logic": "..."},
                {"scenarioType": "Plausible", "logic": "..."},
                {"scenarioType": "Possible",  "logic": "..."}
              ]
            }

            Constraints:
            - 5-8 driving forces, each 1 sentence in description.
            - Exactly 2 axes (the two highest-impact, highest-uncertainty drivers).
            - axes[0] becomes the X axis, axes[1] the Y axis. negative = left/bottom end, positive = right/top.
            - impactMatrix MUST contain exactly one entry per force, with x in [-1.0, 1.0] and y in [-1.0, 1.0],
              where x is "alignment with axes[0].positive" and y is "alignment with axes[1].positive".
            - narrativeLogics: exactly 3 entries in the order Probable / Plausible / Possible. logic is 2-3 sentences.
            - No extra top-level keys, no prose outside JSON, no markdown.
            - Respond in the requested language.
            """;

    /**
     * System prompt for backcasting. One panel per scenario: vision (the desired future state),
     * a sequence of milestones from now to the horizon, and the immediate next move.
     */
    private static final String BACKCASTING_SYSTEM =
            """
            You are a strategic foresight expert specialised in backcasting.

            Given the inputs and the three scenarios, produce a backcasting panel for each scenario.

            Respond ONLY with a single JSON object matching EXACTLY:

            {
              "panels": [
                {
                  "scenarioType": "Probable",
                  "vision": "...",
                  "milestones": [
                    {"timeframe": "0-12 months", "title": "...", "description": "...", "actions": ["...", "..."]}
                  ],
                  "now": "..."
                }
              ]
            }

            Constraints:
            - Exactly 3 panels, in the order Probable / Plausible / Possible.
            - Each panel: 3-5 milestones, ordered earliest first.
            - vision: 1-2 sentences describing the desired future state at the horizon.
            - now: 1 sentence on the single most urgent move to make this scenario reachable.
            - Each milestone: 2-4 actions, short verb phrases.
            - No extra top-level keys, no prose outside JSON, no markdown.
            - Respond in the requested language.
            """;

    /** System prompt for the H1/H2/H3 strategic-priorities map. */
    private static final String STRATEGIC_MAP_SYSTEM =
            """
            You are a strategic foresight expert.

            Synthesise strategic priorities by horizon based on the inputs and the three scenarios.

            Respond ONLY with a single JSON object matching EXACTLY:

            {
              "h1": [{"title": "...", "description": "..."}],
              "h2": [{"title": "...", "description": "..."}],
              "h3": [{"title": "...", "description": "..."}]
            }

            Constraints:
            - 3-4 priorities per horizon. Each description 1-2 sentences.
            - H1 = present-extended (0-2 years). H2 = emerging (2-5 years). H3 = transformative (5+ years).
            - No extra keys, no prose outside JSON, no markdown.
            - Respond in the requested language.
            """;

    /**
     * System prompt template for the chat assistant. The user's language and the
     * current report context (when present) are stitched in at request time.
     *
     * <p>Two non-obvious behaviours are encoded here:
     * <ol>
     *   <li>Confirm-before-spending — costly tools ({@code runAnalysis},
     *       {@code generateGlobalSteep}, {@code deleteReport}) MUST be confirmed
     *       verbally with the user before the model emits them. Without this rule
     *       the model is happy to "just go ahead" the moment the user hints at a
     *       direction, burning Anthropic credits or destroying data.</li>
     *   <li>Speak the tool descriptions, not the names — the model surfaces
     *       capabilities to the user in prose. The tool names ({@code goTo},
     *       {@code setField}) are internal jargon; the user should never see them.</li>
     * </ol>
     */
    private static final String CHAT_SYSTEM_TEMPLATE =
            """
            You are the Foresight Strategy assistant — embedded inside the Futuros app, a
            strategic foresight tool. You help consultants navigate the wizard, fill in fields,
            understand the methodology and interpret the resulting reports.

            ## Tone
            - Concise, professional, in the user's language (%s).
            - You are not a generic chatbot — stay focused on the foresight work in front of the user.
            - When the user is vague, ask one targeted question rather than guessing.

            ## Tools
            You have a set of tools that act on the app. Emit them as tool_use blocks when the
            user asks you to do something (navigate, fill a field, run the analysis, share the
            report, etc.).

            **Confirm before spending** — for any tool that costs Anthropic credits or makes
            irreversible changes (runAnalysis, generateGlobalSteep, deleteReport), you MUST
            verbally confirm with the user FIRST. Ask "¿Quieres que lance el análisis ahora?"
            and wait for an affirmative reply before emitting the tool. The user can also click
            the chip directly if they prefer.

            **For setField** — propose values; the user clicks a chip to apply. Don't re-emit
            the same field repeatedly. Keep proposals focused; long replacements should use
            mode "replace", additions to existing prose should use mode "add".

            **Don't reveal tool names** — when listing what you can do, describe the actions in
            plain prose, not in terms of internal command names like goTo or setField.

            ## Report context
            %s
            """;

    /**
     * System prompt for the sources extraction step. Uses {@code web_search} to find the
     * authoritative public references that ground a sectoral foresight analysis. Each source
     * comes back with a title, URL, and a one-line description of its relevance.
     */
    private static final String SOURCES_SYSTEM =
            """
            You are a research assistant for strategic foresight reports.

            Use the web_search tool to find 6-10 authoritative, recent public sources (think tanks,
            government reports, industry studies, peer-reviewed journals, reputable press) that ground
            a foresight analysis for the given company/sector. Prefer sources from the last 24 months.

            Respond ONLY with a single JSON object matching EXACTLY:

            {
              "sources": [
                {"title": "...", "url": "https://...", "description": "..."}
              ]
            }

            Constraints:
            - 6-10 sources. Each description 1 sentence.
            - URLs MUST be real, complete, and publicly accessible. NEVER fabricate URLs.
            - No extra keys, no prose outside JSON, no markdown.
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
        String prompt = "%s\n\nSector: %s\nCurrent year: %d"
                .formatted(
                        langInstruction(request.language()),
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
        String prompt = "%s\n\nDimension: %s\nCompany profile:\n%s"
                .formatted(langInstruction(request.language()), request.dimension(), request.companyProfile());
        return anthropicClient.sendMessage(STEEP_SYSTEM, prompt, 700).map(AiResponseSanitizer::sanitize);
    }

    /**
     * Suggests signals for a given horizon (H1/H2/H3).
     *
     * @param request validated request carrying horizon, company profile, and language
     * @return Claude's raw JSON reply (expected shape: {@code {"signals": [...]}})
     */
    public Mono<JsonNode> suggestHorizon(HorizonSuggestRequest request) {
        String prompt = "%s\n\nHorizon: %s\nCompany profile:\n%s"
                .formatted(langInstruction(request.language()), request.horizon(), request.companyProfile());
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
                %s

                Company profile: %s
                STEEP analysis: %s
                Horizon signals: %s
                """
                        .formatted(
                                langInstruction(request.language()),
                                request.companyProfile().toString(),
                                request.steep().toString(),
                                request.horizon().toString());
        return anthropicClient.sendMessage(ANALYZE_SYSTEM, prompt, 16000).map(AiResponseSanitizer::sanitize);
    }

    /**
     * Second pass — driving forces, critical-uncertainty axes, impact-matrix placement and
     * narrative logic per scenario. Anchored on the scenarios produced by {@link #analyze}.
     */
    public Mono<JsonNode> scenarioPlanning(AnalyzeContextRequest request) {
        String prompt = contextPrompt(request);
        return anthropicClient.sendMessage(SCENARIO_PLANNING_SYSTEM, prompt, 8000).map(AiResponseSanitizer::sanitize);
    }

    /**
     * Third pass — one backcasting panel per scenario, milestones from now to horizon plus
     * the immediate next move. Anchored on the scenarios produced by {@link #analyze}.
     */
    public Mono<JsonNode> backcasting(AnalyzeContextRequest request) {
        String prompt = contextPrompt(request);
        return anthropicClient.sendMessage(BACKCASTING_SYSTEM, prompt, 10000).map(AiResponseSanitizer::sanitize);
    }

    /**
     * Fourth pass — strategic priorities organised by horizon (H1/H2/H3). Anchored on the
     * scenarios produced by {@link #analyze}.
     */
    public Mono<JsonNode> strategicMap(AnalyzeContextRequest request) {
        String prompt = contextPrompt(request);
        return anthropicClient.sendMessage(STRATEGIC_MAP_SYSTEM, prompt, 6000).map(AiResponseSanitizer::sanitize);
    }

    /**
     * Fifth pass — public references / web sources that ground the analysis. Uses
     * {@code web_search} so the URLs come from real searches, not the model's memory
     * (which is the only reliable way to keep them from being fabricated).
     */
    public Mono<JsonNode> sources(AnalyzeContextRequest request) {
        String prompt = contextPrompt(request);
        return anthropicClient
                .sendMessageWithWebSearch(SOURCES_SYSTEM, prompt, 4000)
                .map(AiResponseSanitizer::sanitize);
    }

    /**
     * Multi-turn chat with the foresight assistant.
     *
     * <p>Stateless: the caller owns the conversation history and re-sends it on every
     * turn. The backend only adds the system prompt (with stitched-in language + report
     * context) and the tool catalogue, then returns Anthropic's raw response so the
     * frontend can iterate the {@code content} blocks (text and {@code tool_use}).
     *
     * <p>Tool-result turns from the frontend (after the user clicked a confirmation chip
     * or a tool ran auto) come back inside {@code messages} as {@code role:"user"} with
     * {@code content} arrays containing {@code tool_result} blocks — exactly Anthropic's
     * wire format, so we forward verbatim.
     */
    public Mono<JsonNode> chat(ChatRequest request) {
        String contextSection = (request.context() == null || request.context().isNull())
                ? "No active report — the user is on the dashboard or hasn't loaded one yet."
                : "Current report state (use it to answer questions about \"this report\"):\n"
                        + request.context().toString();
        String systemPrompt = CHAT_SYSTEM_TEMPLATE.formatted(lang(request.language()), contextSection);
        return anthropicClient
                .sendConversation(systemPrompt, request.messages(), AssistantTools.TOOLS, 4096)
                .map(AiResponseSanitizer::sanitize);
    }

    /**
     * Builds the user-turn prompt shared by the four downstream analysis passes. Includes
     * {@code scenarios} when the caller passed them in so the model anchors its output on
     * the same 3P set the user already saw.
     */
    private String contextPrompt(AnalyzeContextRequest request) {
        StringBuilder sb = new StringBuilder()
                .append(langInstruction(request.language())).append("\n\n")
                .append("Company profile: ").append(request.companyProfile()).append('\n')
                .append("STEEP analysis: ").append(request.steep()).append('\n')
                .append("Horizon signals: ").append(request.horizon());
        if (request.scenarios() != null && !request.scenarios().isNull()) {
            sb.append("\nScenarios already chosen: ").append(request.scenarios());
        }
        return sb.toString();
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

    /**
     * Strong, named-language instruction prepended to every user-turn prompt.
     *
     * <p>An earlier draft passed only the ISO code ({@code "Language: es"}) and ended the
     * system prompt with a short {@code "Respond in the requested language."}. That fell
     * apart on calls that hit {@code web_search}: the tool brings back English source
     * material and Claude tends to drift into the source language instead of the user's.
     *
     * <p>This helper bakes three reinforcements that survive that drift:
     * <ul>
     *   <li>spells the language out by name (Spanish / English) so the model isn't
     *       parsing an ISO code;</li>
     *   <li>lives at the head of the user turn (recency) so it survives long tool loops;</li>
     *   <li>explicitly tells the model to translate source material rather than echo it.</li>
     * </ul>
     */
    private String langInstruction(String language) {
        boolean en = language != null && language.equals("en");
        if (en) {
            return "Output language: ENGLISH. Reply ENTIRELY in English. If web search "
                    + "or any other source returns content in another language, translate "
                    + "the findings to English before writing the response.";
        }
        return "Idioma de salida: ESPAÑOL. Responde ÍNTEGRAMENTE en español. Si la "
                + "búsqueda web o cualquier otra fuente devuelve contenido en otro idioma, "
                + "traduce los hallazgos al español antes de redactar la respuesta.";
    }
}
