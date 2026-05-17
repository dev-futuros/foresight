package com.foresight.backend.common.security;

import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

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
 * <p>Only registered when {@code foresight.security.auth-disabled=true}, so it is impossible for
 * this seeder to run in production.
 */
@Slf4j
@Configuration
@ConditionalOnProperty(prefix = "foresight.security", name = "auth-disabled", havingValue = "true")
public class DevUserSeeder {

    @Bean
    public ApplicationRunner seedDevUser(UserRepository users) {
        return args -> {
            if (users.findById(DevPrincipal.ID).isPresent()) {
                log.info("Dev user already present (id={})", DevPrincipal.ID);
                return;
            }
            User user = User.builder()
                    .externalUserId(DevPrincipal.EXTERNAL_USER_ID)
                    .role(UserRole.USER)
                    .build();
            // Name + language are no longer mirrored locally (V13 dropped the columns).
            // The dev profile gets its display name from {@link DevPrincipal#NAME} via
            // the synthetic-user short-circuit in UserService.getProfile, and its
            // language defaults to "es" via the same path.
            user.setId(DevPrincipal.ID);
            users.save(user);
            log.info("Seeded dev user id={} externalId={}", DevPrincipal.ID, DevPrincipal.EXTERNAL_USER_ID);
        };
    }
}
