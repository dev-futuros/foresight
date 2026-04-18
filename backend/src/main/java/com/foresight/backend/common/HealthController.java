package com.foresight.backend.common;

import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Unauthenticated health probe used by load balancers and uptime monitors.
 */
@RestController
@RequestMapping("/api")
public class HealthController {

    /**
     * Simple liveness check.
     *
     * @return a JSON payload {@code {"status": "ok"}} as long as the app is accepting requests.
     */
    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of("status", "ok");
    }
}
