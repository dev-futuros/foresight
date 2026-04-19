package com.foresight.backend.common.security;

import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.password.PasswordEncoder;

import com.foresight.backend.user.User;
import com.foresight.backend.user.UserRepository;
import com.foresight.backend.user.UserRole;

import lombok.extern.slf4j.Slf4j;

/**
 * Ensures a dev user with {@link DevPrincipal#ID} exists in the database when authentication is
 * disabled. This means endpoints that look up the caller (e.g. {@code GET /api/users/me}) and
 * those that persist {@code user_id} foreign references (e.g. reports) work out of the box in
 * local mode.
 *
 * <p>Only registered when {@code foresight.security.auth-disabled=true}, so it is impossible
 * for this seeder to run in production.
 */
@Slf4j
@Configuration
@ConditionalOnProperty(prefix = "foresight.security", name = "auth-disabled", havingValue = "true")
public class DevUserSeeder {

    // The dev user never logs in via the password flow — it's injected by JwtAuthFilter when
    // auth is disabled. The literal below exists only to satisfy User#password's NOT NULL
    // constraint. Hence Sonar's S2068 ("hardcoded credential") is a deliberate false positive.
    @SuppressWarnings("java:S2068")
    private static final String DEV_USER_PLACEHOLDER_PASSWORD = "dev-password-not-for-login";

    /**
     * Idempotent startup seeder.
     *
     * @param users           user repository
     * @param passwordEncoder bean used to hash a placeholder password
     * @return an {@link ApplicationRunner} that runs once after Spring is fully started
     */
    @Bean
    public ApplicationRunner seedDevUser(UserRepository users, PasswordEncoder passwordEncoder) {
        return args -> {
            if (users.findById(DevPrincipal.ID).isPresent()) {
                log.info("Dev user already present (id={})", DevPrincipal.ID);
                return;
            }
            User user = User.builder()
                    .email(DevPrincipal.EMAIL)
                    .password(passwordEncoder.encode(DEV_USER_PLACEHOLDER_PASSWORD))
                    .name(DevPrincipal.NAME)
                    .role(UserRole.USER)
                    .language("es")
                    .emailVerified(true)
                    .build();
            user.setId(DevPrincipal.ID);
            users.save(user);
            log.info("Seeded dev user id={} email={}", DevPrincipal.ID, DevPrincipal.EMAIL);
        };
    }
}
