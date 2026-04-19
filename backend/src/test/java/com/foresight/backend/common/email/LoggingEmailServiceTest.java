package com.foresight.backend.common.email;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;

import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.test.util.ReflectionTestUtils;

class LoggingEmailServiceTest {

    @Test
    void sendPasswordResetEmailDoesNotThrow() {
        LoggingEmailService service = new LoggingEmailService();

        assertDoesNotThrow(() -> service.sendPasswordResetEmail("user@example.com", "raw-reset-token"));
    }

    @Test
    void sendEmailVerificationEmailDoesNotThrow() {
        LoggingEmailService service = new LoggingEmailService();

        assertDoesNotThrow(() -> service.sendEmailVerificationEmail("user@example.com", "raw-verification-token"));
    }

    @Test
    void classHasSlf4jLogger() {
        LoggingEmailService service = new LoggingEmailService();

        Object logger = ReflectionTestUtils.getField(service, "log");
        assertThat(logger).isNotNull().isSameAs(LoggerFactory.getLogger(LoggingEmailService.class));
    }
}
