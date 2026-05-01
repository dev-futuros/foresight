package com.foresight.backend.ai;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.databind.node.TextNode;

/**
 * Cleans up text content returned by an LLM before it is shown to clients or persisted.
 *
 * <p>Apply this to any AI-generated payload at the boundary between the model and the rest
 * of the system. New AI-backed routes should call {@link #sanitize(JsonNode)} on the
 * provider response before returning or saving — that way the rest of the stack (frontend,
 * database) only ever sees cleaned content, regardless of how the model decides to format
 * its output on a given day.
 *
 * <p>Currently strips Anthropic-style {@code <cite index="...">…</cite>} markers that the
 * model occasionally emits inside prose, leaving the inner text intact. Add new rules here
 * as new patterns appear.
 */
public final class AiResponseSanitizer {

    private static final Pattern CITE_TAG =
            Pattern.compile("<cite\\b[^>]*>(.*?)</cite>", Pattern.DOTALL | Pattern.CASE_INSENSITIVE);

    private AiResponseSanitizer() {}

    /**
     * Returns a sanitized copy of {@code node} with citation markers removed from every
     * string value reachable through the JSON tree. Non-string values are preserved as-is.
     *
     * @param node any JSON node (object, array, or scalar); {@code null} yields {@code null}
     * @return the cleaned node, or {@code node} itself when no changes are needed
     */
    public static JsonNode sanitize(JsonNode node) {
        if (node == null || node.isNull()) {
            return node;
        }
        if (node.isTextual()) {
            String cleaned = clean(node.textValue());
            return cleaned.equals(node.textValue()) ? node : TextNode.valueOf(cleaned);
        }
        if (node.isObject()) {
            ObjectNode obj = (ObjectNode) node;
            List<Map.Entry<String, JsonNode>> updates = new ArrayList<>();
            Iterator<Map.Entry<String, JsonNode>> fields = obj.fields();
            while (fields.hasNext()) {
                Map.Entry<String, JsonNode> entry = fields.next();
                JsonNode sanitized = sanitize(entry.getValue());
                if (sanitized != entry.getValue()) {
                    updates.add(Map.entry(entry.getKey(), sanitized));
                }
            }
            for (Map.Entry<String, JsonNode> update : updates) {
                obj.set(update.getKey(), update.getValue());
            }
            return obj;
        }
        if (node.isArray()) {
            ArrayNode arr = (ArrayNode) node;
            for (int i = 0; i < arr.size(); i++) {
                JsonNode sanitized = sanitize(arr.get(i));
                if (sanitized != arr.get(i)) {
                    arr.set(i, sanitized);
                }
            }
            return arr;
        }
        return node;
    }

    private static String clean(String text) {
        if (text == null || text.isEmpty()) {
            return text;
        }
        return CITE_TAG.matcher(text).replaceAll("$1");
    }
}
