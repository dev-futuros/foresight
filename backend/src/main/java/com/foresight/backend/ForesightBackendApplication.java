package com.foresight.backend;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;

/**
 * Entry point for the Foresight backend application.
 *
 * <p>Bootstraps the Spring Boot context and enables JPA auditing so that
 * {@code @CreatedDate} / {@code @LastModifiedDate} fields in
 * {@link com.foresight.backend.common.domain.BaseEntity} are populated automatically.
 */
@SpringBootApplication
@EnableJpaAuditing
public class ForesightBackendApplication {

    /**
     * Starts the Spring Boot application.
     *
     * @param args command-line arguments forwarded to Spring Boot
     */
    public static void main(String[] args) {
        SpringApplication.run(ForesightBackendApplication.class, args);
    }
}
