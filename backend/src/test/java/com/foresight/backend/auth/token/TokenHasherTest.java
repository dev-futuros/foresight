package com.foresight.backend.auth.token;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.HashSet;
import java.util.Set;

import org.junit.jupiter.api.Test;

class TokenHasherTest {

    @Test
    void newRawTokenIsBase64UrlWithoutPadding() {
        String token = TokenHasher.newRawToken();

        // 32 bytes → Base64url (no padding) → 43 chars.
        assertThat(token).hasSize(43);
        assertThat(token).doesNotContain("=");
        assertThat(token).matches("[A-Za-z0-9_-]+");
    }

    @Test
    void newRawTokenIsDistinctAcrossCalls() {
        Set<String> tokens = new HashSet<>();
        for (int i = 0; i < 1000; i++) {
            tokens.add(TokenHasher.newRawToken());
        }
        // 256 bits of entropy — a collision across 1k draws would indicate a broken RNG.
        assertThat(tokens).hasSize(1000);
    }

    @Test
    void hashProducesStableLowercaseHex() {
        String hash = TokenHasher.hash("known-token");

        assertThat(hash).hasSize(64);
        assertThat(hash).matches("[0-9a-f]+");
        // Deterministic: hashing the same input twice must match.
        assertThat(TokenHasher.hash("known-token")).isEqualTo(hash);
    }

    @Test
    void hashDiffersForDifferentInputs() {
        assertThat(TokenHasher.hash("a")).isNotEqualTo(TokenHasher.hash("b"));
    }
}
