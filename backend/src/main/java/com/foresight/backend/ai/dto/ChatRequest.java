package com.foresight.backend.ai.dto;

import java.util.List;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import com.fasterxml.jackson.databind.JsonNode;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Request body for {@code POST /api/ai/chat}.
 *
 * <p>The endpoint is intentionally stateless: the client owns the full
 * conversation history and re-sends it on every turn. This keeps the backend
 * a thin proxy, lets the user reset/branch their chat without server state to
 * reconcile, and keeps each request idempotent at the protocol level.
 *
 * <p>{@code messages} mirrors Anthropic's wire shape — each entry is either
 * a plain string content or a list of {@code text}/{@code tool_use}/
 * {@code tool_result} blocks, depending on what role emitted it. We pass the
 * shape through verbatim rather than re-typing every variant.
 *
 * <p>{@code context} is an optional snapshot of the current report state
 * (form values, active step, current report id) that the system prompt
 * stitches into the context window so the assistant can answer questions
 * about "this report" without the user having to spell it out.
 *
 * @param messages full conversation history, ordered oldest-first
 * @param context  optional snapshot of current wizard / report state
 * @param language target language for the assistant's prose ({@code "es"} or {@code "en"})
 */
public record ChatRequest(
        @NotEmpty @Schema(description = "Full conversation, oldest-first. Each entry mirrors Anthropic's"
                + " messages[] shape: {role, content} where content is either a string or an array of"
                + " content blocks.")
                @NotNull
                List<JsonNode> messages,
        @Schema(description = "Optional snapshot of the current wizard/report state, stitched into the"
                + " system prompt so the assistant answers grounded on what the user is looking at.")
                JsonNode context,
        @Schema(example = "es") String language) {}
