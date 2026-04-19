package com.foresight.backend.ai;

import java.util.concurrent.TimeUnit;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.web.reactive.function.client.WebClient;

import io.netty.channel.ChannelOption;
import io.netty.handler.timeout.ReadTimeoutHandler;
import io.netty.handler.timeout.WriteTimeoutHandler;
import reactor.netty.http.client.HttpClient;

/**
 * Spring configuration for the Anthropic integration.
 *
 * <p>Builds the pre-configured {@link WebClient} used by {@link AnthropicClient}, with the base
 * URL, API key, API version headers, connect/read timeouts, and the request body size cap
 * already baked in so call sites don't repeat themselves.
 */
@Configuration
@EnableConfigurationProperties(AnthropicProperties.class)
public class AnthropicConfig {

    /** Large enough for Claude's long-form responses (worst case ~a few MB of JSON). */
    private static final int MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

    /**
     * Creates the {@link WebClient} bean used for all Anthropic calls.
     *
     * <p>Wires the reactor-netty client with explicit connect / read / write timeouts so we
     * never hang the request thread on a silently stalled upstream connection. Retry logic
     * lives in {@link AnthropicClient}.
     *
     * @param properties resolved {@code foresight.ai.anthropic.*} settings
     * @return a {@link WebClient} with base URL, auth headers and timeouts configured
     */
    @Bean
    public WebClient anthropicWebClient(AnthropicProperties properties) {
        long connectMs = properties.connectTimeout().toMillis();
        long readSeconds = properties.readTimeout().getSeconds();

        HttpClient httpClient = HttpClient.create()
                .option(ChannelOption.CONNECT_TIMEOUT_MILLIS, (int) connectMs)
                .responseTimeout(properties.readTimeout())
                .doOnConnected(conn -> conn.addHandlerLast(new ReadTimeoutHandler(readSeconds, TimeUnit.SECONDS))
                        .addHandlerLast(new WriteTimeoutHandler(readSeconds, TimeUnit.SECONDS)));

        return WebClient.builder()
                .baseUrl(properties.baseUrl())
                .defaultHeader("x-api-key", properties.apiKey())
                .defaultHeader("anthropic-version", properties.version())
                .defaultHeader("content-type", "application/json")
                .clientConnector(new ReactorClientHttpConnector(httpClient))
                .codecs(c -> c.defaultCodecs().maxInMemorySize(MAX_RESPONSE_BYTES))
                .build();
    }
}
