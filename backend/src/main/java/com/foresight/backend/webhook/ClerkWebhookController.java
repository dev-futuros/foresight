package com.foresight.backend.webhook;

import java.net.http.HttpHeaders;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.foresight.backend.common.config.SecurityProperties;
import com.foresight.backend.user.UserService;
import com.svix.Webhook;
import com.svix.exceptions.WebhookVerificationException;

import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Receives lifecycle events from Clerk so the local {@code users} table stays in sync with
 * Clerk's source-of-truth user store.
 *
 * <p>Signature verification — Clerk's webhook infrastructure is built on Svix, which signs every
 * delivery with an HMAC over the request body keyed by a secret configured per-endpoint. This
 * controller verifies the signature using the official Svix client before doing any work; any
 * delivery without a valid signature is rejected with HTTP 400 so an attacker cannot forge user
 * lifecycle events.
 *
 * <p>Idempotency — Clerk may redeliver the same event on transient failures. The handlers below
 * are written so a second delivery is a safe no-op (upsert for create/update, no-op-if-missing
 * for delete).
 *
 * <p>The endpoint is intentionally public from Spring Security's perspective: its authentication
 * is the Svix signature, not a JWT.
 */
@Slf4j
@RestController
@RequestMapping("/api/webhooks/clerk")
@RequiredArgsConstructor
public class ClerkWebhookController {

    private final UserService userService;
    private final SecurityProperties securityProperties;
    private final ClerkEventParser eventParser = new ClerkEventParser();

    @Operation(summary = "Clerk webhook receiver — verifies the Svix signature and syncs users.")
    @PostMapping
    public ResponseEntity<Void> receive(@RequestBody String rawBody, HttpServletRequest request) {
        HttpHeaders headers = collectHeaders(request);

        try {
            Webhook webhook = new Webhook(securityProperties.clerk().webhookSigningSecret());
            webhook.verify(rawBody, headers);
        } catch (WebhookVerificationException ex) {
            log.warn("Rejected Clerk webhook with invalid signature: {}", ex.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).build();
        }

        ClerkEvent event = eventParser.parse(rawBody);
        switch (event.type()) {
            case "user.created", "user.updated" -> userService.upsertFromClerk(
                    event.clerkUserId(), event.email(), event.name());
            case "user.deleted" -> userService.deleteByClerkUserId(event.clerkUserId());
            default -> log.debug("Ignoring Clerk event type {}", event.type());
        }
        return ResponseEntity.noContent().build();
    }

    /**
     * Re-shapes the servlet request headers into the {@link java.net.http.HttpHeaders} type the
     * Svix client expects. Header names are lowercased because Svix's verifier looks them up by
     * exact match (e.g. {@code svix-id}) and the servlet API preserves the casing the client
     * sent — which can vary between proxies.
     */
    private static HttpHeaders collectHeaders(HttpServletRequest request) {
        Map<String, List<String>> map = new HashMap<>();
        var names = request.getHeaderNames();
        while (names.hasMoreElements()) {
            String name = names.nextElement();
            List<String> values = map.computeIfAbsent(name.toLowerCase(java.util.Locale.ROOT), k -> new ArrayList<>());
            var headerValues = request.getHeaders(name);
            while (headerValues.hasMoreElements()) {
                values.add(headerValues.nextElement());
            }
        }
        Map<String, List<String>> immutable = new HashMap<>();
        map.forEach((k, v) -> immutable.put(k, Collections.unmodifiableList(v)));
        return HttpHeaders.of(immutable, (k, v) -> true);
    }
}
