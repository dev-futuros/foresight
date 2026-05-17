package com.foresight.backend.webhook;

import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.foresight.backend.user.UserService;

import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Receives lifecycle events from Kinde so the local {@code users} table stays in sync with
 * Kinde's source-of-truth user store.
 *
 * <p>Signature verification — unlike Clerk's Svix-signed JSON deliveries, Kinde sends the entire
 * webhook payload AS a JWT (the request body is the token itself). The JWT is signed by Kinde
 * with the same key set we already use for session tokens, so the bean injected here is the same
 * {@link JwtDecoder} {@code KindeJwtDecoderConfig} exposes for the auth filter — one source of
 * truth for "did this signature come from our Kinde tenant?". Any delivery that fails decoding
 * is rejected with HTTP 400 before any side effect, so an attacker cannot forge user-lifecycle
 * events.
 *
 * <p>Payload shape — Kinde claims live at the JWT root: {@code type} carries the event name
 * (e.g. {@code user.created}), and {@code data} is a nested object with the event-specific
 * fields. For user events we read {@code data.userId}, {@code data.firstName}, and
 * {@code data.lastName}.
 *
 * <p>Idempotency — Kinde may redeliver the same event on transient failures. The handlers below
 * are written so a second delivery is a safe no-op (upsert for create/update, no-op-if-missing
 * for delete).
 *
 * <p>The endpoint is intentionally public from Spring Security's perspective: its authentication
 * is the JWT signature, not a session bearer token. See {@code SecurityConfig} for the
 * {@code permitAll} matcher.
 */
@Slf4j
@RestController
@RequestMapping("/api/webhooks/kinde")
@RequiredArgsConstructor
public class KindeWebhookController {

    private final JwtDecoder jwtDecoder;
    private final UserService userService;

    @Operation(summary = "Kinde webhook receiver — verifies the JWT signature and syncs users.")
    @PostMapping
    public ResponseEntity<Void> receive(@RequestBody String jwtBody) {
        if (jwtBody == null || jwtBody.isBlank()) {
            log.warn("Rejected Kinde webhook with empty body");
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).build();
        }
        Jwt jwt;
        try {
            jwt = jwtDecoder.decode(jwtBody.trim());
        } catch (JwtException ex) {
            log.warn("Rejected Kinde webhook with invalid JWT: {}", ex.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).build();
        }

        String type = jwt.getClaimAsString("type");
        Map<String, Object> data = jwt.getClaim("data");
        if (type == null || data == null) {
            log.warn("Kinde webhook payload missing required claim(s) — type={}, data present={}", type, data != null);
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).build();
        }

        switch (type) {
            case "user.created", "user.updated" -> {
                String externalUserId = stringOrNull(data, "userId");
                if (externalUserId == null) {
                    log.warn("Kinde {} webhook payload missing data.userId", type);
                    return ResponseEntity.status(HttpStatus.BAD_REQUEST).build();
                }
                // user.created → idempotent insert so the local row exists for FKs even
                // before the user logs in for the first time.
                // user.updated → effectively a no-op for us now: profile fields (name,
                // language, email) live in Kinde, so there's nothing local to update.
                // We still call upsertFromExternal to handle the redelivery case where
                // the original user.created was lost.
                userService.upsertFromExternal(externalUserId);
            }
            case "user.deleted" -> {
                String externalUserId = stringOrNull(data, "userId");
                if (externalUserId == null) {
                    log.warn("Kinde user.deleted webhook payload missing data.userId");
                    return ResponseEntity.status(HttpStatus.BAD_REQUEST).build();
                }
                userService.deleteByExternalUserId(externalUserId);
            }
            default -> log.debug("Ignoring Kinde event type {}", type);
        }
        return ResponseEntity.noContent().build();
    }

    /**
     * Reads a string-typed field from the nested {@code data} claim, normalising blank values to
     * {@code null}. Defensive about the runtime type because Jackson can deserialise JSON numbers
     * or booleans into {@code Number} / {@code Boolean}, not {@code String}.
     */
    private static String stringOrNull(Map<String, Object> data, String key) {
        Object value = data.get(key);
        if (value == null) return null;
        String str = value.toString();
        return str.isBlank() ? null : str;
    }
}
