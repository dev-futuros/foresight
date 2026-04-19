package com.foresight.backend.auth.token;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;

/**
 * Utility for generating opaque, single-use auth tokens (password reset, email verification)
 * and hashing them for storage.
 *
 * <p>Design:
 * <ul>
 *   <li>The raw token is 32 random bytes, Base64url-encoded (~43 chars). Enough entropy
 *       to be unguessable and short enough to paste cleanly into a URL.</li>
 *   <li>We store only the SHA-256 of the raw token (64 hex chars). A DB leak therefore does
 *       not hand attackers usable tokens.</li>
 *   <li>Verification hashes the incoming token and compares it against the stored hash.</li>
 * </ul>
 *
 * <p>Note: SHA-256 is the right primitive here. BCrypt/Argon2 exist to slow down password
 * cracking of low-entropy secrets — our tokens already have 256 bits of entropy, so a single
 * hash pass is both secure and fast enough for high-volume verification lookups.
 */
public final class TokenHasher {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Base64.Encoder BASE64_URL = Base64.getUrlEncoder().withoutPadding();

    private TokenHasher() {}

    /**
     * @return a 32-byte cryptographically random token encoded as Base64url (no padding).
     */
    public static String newRawToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return BASE64_URL.encodeToString(bytes);
    }

    /**
     * SHA-256 of the given raw token, lowercase hex.
     *
     * @param rawToken the token as issued to the user
     * @return 64-char hex digest suitable for the {@code token_hash} column
     */
    public static String hash(String rawToken) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest(rawToken.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            // SHA-256 is mandatory in every JRE; this path is unreachable.
            throw new IllegalStateException("SHA-256 not available", e);
        }
    }
}
