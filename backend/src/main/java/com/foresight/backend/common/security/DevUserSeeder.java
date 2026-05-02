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

    /**
     * Synthetic Clerk id used by the seeded dev user. Not a real Clerk identifier, just a stable
     * placeholder that satisfies the NOT NULL / UNIQUE constraint on {@code clerk_user_id}.
     */
    private static final String DEV_CLERK_USER_ID = "user_local_dev";

    @Bean
    public ApplicationRunner seedDevUser(UserRepository users) {
        return args -> {
            if (users.findById(DevPrincipal.ID).isPresent()) {
                log.info("Dev user already present (id={})", DevPrincipal.ID);
                return;
            }
            User user = User.builder()
                    .clerkUserId(DEV_CLERK_USER_ID)
                    .email(DevPrincipal.EMAIL)
                    .name(DevPrincipal.NAME)
                    .role(UserRole.USER)
                    .language("es")
                    .build();
            user.setId(DevPrincipal.ID);
            users.save(user);
            log.info("Seeded dev user id={} email={}", DevPrincipal.ID, DevPrincipal.EMAIL);
        };
    }
}
