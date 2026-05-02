package com.foresight.backend.webhook;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.foresight.backend.common.exception.BadRequestException;

/**
 * Reads the JSON body of a verified Clerk webhook delivery into a {@link ClerkEvent}.
 *
 * <p>Clerk delivers events with a top-level shape of:
 *
 * <pre>{@code
 * {
 *   "type": "user.created",
 *   "object": "event",
 *   "data": {
 *     "id": "user_2abc...",
 *     "email_addresses": [
 *       { "id": "idn_...", "email_address": "user@example.com" },
 *       ...
 *     ],
 *     "primary_email_address_id": "idn_...",
 *     "first_name": "Roger",
 *     "last_name": "Henares",
 *     ...
 *   }
 * }
 * }</pre>
 *
 * <p>The parser is deliberately defensive: missing optional fields collapse to {@code null}, and
 * a missing {@code type} or {@code data.id} (both required) raises a {@link BadRequestException}
 * so the webhook receiver returns 400 — Clerk will then mark the delivery as failed.
 */
class ClerkEventParser {

    private final ObjectMapper mapper = new ObjectMapper();

    ClerkEvent parse(String rawBody) {
        JsonNode root;
        try {
            root = mapper.readTree(rawBody);
        } catch (Exception ex) {
            throw new BadRequestException("Invalid JSON in Clerk webhook payload");
        }
        String type = textOrNull(root, "type");
        JsonNode data = root.get("data");
        if (type == null || data == null) {
            throw new BadRequestException("Clerk webhook payload missing required fields");
        }
        String clerkUserId = textOrNull(data, "id");
        if (clerkUserId == null) {
            throw new BadRequestException("Clerk webhook payload missing data.id");
        }
        return new ClerkEvent(type, clerkUserId, primaryEmail(data), composedName(data));
    }

    private static String primaryEmail(JsonNode data) {
        String primaryId = textOrNull(data, "primary_email_address_id");
        JsonNode emails = data.get("email_addresses");
        if (emails == null || !emails.isArray() || emails.isEmpty()) return null;
        // Prefer the entry flagged as primary. Fall back to the first one if the primary id
        // is missing — keeps a row creatable even with a non-standard payload shape.
        for (JsonNode entry : emails) {
            if (primaryId != null && primaryId.equals(textOrNull(entry, "id"))) {
                return textOrNull(entry, "email_address");
            }
        }
        return textOrNull(emails.get(0), "email_address");
    }

    private static String composedName(JsonNode data) {
        String first = textOrNull(data, "first_name");
        String last = textOrNull(data, "last_name");
        if (first == null && last == null) return null;
        if (first == null) return last;
        if (last == null) return first;
        return first + " " + last;
    }

    private static String textOrNull(JsonNode node, String field) {
        if (node == null) return null;
        JsonNode value = node.get(field);
        if (value == null || value.isNull()) return null;
        String text = value.asText();
        return text.isBlank() ? null : text;
    }
}
