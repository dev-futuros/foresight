package com.foresight.backend.ai;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

class AiResponseSanitizerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Test
    void stripsSimpleCiteTagPreservingInnerText() throws Exception {
        JsonNode input = MAPPER.readTree("{\"text\":\"Hello <cite index=\\\"2-5\\\">world</cite>!\"}");

        JsonNode result = AiResponseSanitizer.sanitize(input);

        assertThat(result.get("text").textValue()).isEqualTo("Hello world!");
    }

    @Test
    void stripsMultipleAndMultilineCiteTags() throws Exception {
        String raw = "{\"body\":\"<cite index=\\\"1-2\\\">First\\nclaim</cite> and "
                + "<cite index=\\\"3-4,5-6\\\">second one</cite>.\"}";
        JsonNode input = MAPPER.readTree(raw);

        JsonNode result = AiResponseSanitizer.sanitize(input);

        assertThat(result.get("body").textValue()).isEqualTo("First\nclaim and second one.");
    }

    @Test
    void recursesIntoNestedObjectsAndArrays() throws Exception {
        String raw = "{\"factors\":[" + "{\"title\":\"<cite index=\\\"1\\\">A</cite>\","
                + "\"description\":\"plain\"},"
                + "{\"title\":\"B\",\"description\":\"<cite>nested</cite> here\"}"
                + "]}";
        JsonNode input = MAPPER.readTree(raw);

        JsonNode result = AiResponseSanitizer.sanitize(input);

        assertThat(result.get("factors").get(0).get("title").textValue()).isEqualTo("A");
        assertThat(result.get("factors").get(0).get("description").textValue()).isEqualTo("plain");
        assertThat(result.get("factors").get(1).get("title").textValue()).isEqualTo("B");
        assertThat(result.get("factors").get(1).get("description").textValue()).isEqualTo("nested here");
    }

    @Test
    void leavesPayloadUntouchedWhenNoTagsPresent() throws Exception {
        JsonNode input = MAPPER.readTree("{\"factors\":[{\"title\":\"clean\",\"score\":0.8}]}");

        JsonNode result = AiResponseSanitizer.sanitize(input);

        assertThat(result.toString()).isEqualTo(input.toString());
    }

    @Test
    void handlesNullAndScalarInputs() throws Exception {
        assertThat(AiResponseSanitizer.sanitize(null)).isNull();

        JsonNode number = MAPPER.readTree("42");
        assertThat(AiResponseSanitizer.sanitize(number)).isSameAs(number);

        JsonNode bare = MAPPER.readTree("\"<cite index=\\\"x\\\">hi</cite>\"");
        JsonNode cleaned = AiResponseSanitizer.sanitize(bare);
        assertThat(cleaned.textValue()).isEqualTo("hi");
    }

    @Test
    void caseInsensitiveTagMatching() throws Exception {
        JsonNode input = MAPPER.readTree("{\"t\":\"a <CITE Index=\\\"1\\\">b</Cite> c\"}");

        JsonNode result = AiResponseSanitizer.sanitize(input);

        assertThat(result.get("t").textValue()).isEqualTo("a b c");
    }
}
