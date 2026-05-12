package com.foresight.backend.ai;

import java.util.List;
import java.util.Map;

/**
 * Catalogue of {@code tools} declared to the model in the chat endpoint.
 *
 * <p>Each tool corresponds to a registered command on the frontend bus. The
 * model emits a {@code tool_use} block with the tool's {@code name} and the
 * arguments declared here, the frontend dispatches to the matching command,
 * and the result (or "user cancelled", or an error) flows back as a
 * {@code tool_result} on the next user turn.
 *
 * <p>Descriptions are user-facing — the model exposes them when the user asks
 * "what can you do?". Keep them in plain prose, no internal jargon. Spanish
 * descriptions are fine here because the assistant always replies in the
 * user's language and the descriptions act as documentation, not commands.
 *
 * <p>Tools that <em>spend money or change state irreversibly</em>
 * ({@code runAnalysis}, {@code generateGlobalSteep}, {@code deleteReport})
 * are marked with a {@code confirm} hint in their description so the model
 * knows to ask the user verbally before emitting them. The frontend
 * additionally renders a confirmation chip the user must click.
 */
public final class AssistantTools {

    private AssistantTools() {}

    /**
     * The tool list passed verbatim to Anthropic. Order is deliberate — the
     * model tends to reach for tools earlier in the list more readily, so
     * we put the most common, low-risk ones first.
     */
    public static final List<Map<String, Object>> TOOLS = List.of(
            tool(
                    "goTo",
                    "Navega al paso indicado del wizard (1-4 inputs, 6 resultados).",
                    Map.of(
                            "type", "object",
                            "properties", Map.of(
                                    "step", Map.of(
                                            "type", "integer",
                                            "minimum", 1,
                                            "maximum", 6,
                                            "description", "Número del paso a mostrar")),
                            "required", List.of("step"))),
            tool(
                    "openDashboard",
                    "Abre el dashboard con la lista de informes guardados del usuario.",
                    Map.of("type", "object", "properties", Map.of())),
            tool(
                    "closeDashboard",
                    "Cierra el dashboard y vuelve al wizard.",
                    Map.of("type", "object", "properties", Map.of())),
            tool(
                    "newReport",
                    "Empieza un informe nuevo en blanco. Limpia el formulario actual.",
                    Map.of("type", "object", "properties", Map.of())),
            tool(
                    "setLang",
                    "Cambia el idioma de la interfaz.",
                    Map.of(
                            "type", "object",
                            "properties", Map.of(
                                    "lang", Map.of(
                                            "type", "string",
                                            "enum", List.of("es", "en"),
                                            "description", "Idioma destino: 'es' o 'en'")),
                            "required", List.of("lang"))),
            tool(
                    "loadReport",
                    "Carga un informe guardado por su id en el formulario.",
                    Map.of(
                            "type", "object",
                            "properties", Map.of(
                                    "id", Map.of("type", "string", "description", "UUID del informe a cargar")),
                            "required", List.of("id"))),
            tool(
                    "editReport",
                    "Abre un informe (típicamente un borrador) en modo edición del wizard, para retocar"
                            + " los inputs. Usa loadReport para abrir el visor de un informe ya completo.",
                    Map.of(
                            "type", "object",
                            "properties", Map.of(
                                    "id", Map.of("type", "string", "description", "UUID del informe a editar")),
                            "required", List.of("id"))),
            tool(
                    "refreshReports",
                    "Refresca la lista de informes (invalida la caché). Útil tras cambios fuera de banda.",
                    Map.of("type", "object", "properties", Map.of())),
            tool(
                    "deleteReport",
                    "Borra un informe guardado por su id. Acción destructiva e irreversible —"
                            + " confirma verbalmente con el usuario antes de emitir esta tool.",
                    Map.of(
                            "type", "object",
                            "properties", Map.of(
                                    "id", Map.of("type", "string", "description", "UUID del informe a borrar")),
                            "required", List.of("id"))),
            tool(
                    "setField",
                    "Sugiere un valor para un campo del formulario. El usuario verá un chip y decide"
                            + " si aplicarlo (no se aplica automáticamente). Úsalo para proponer textos al usuario.",
                    Map.of(
                            "type", "object",
                            "properties", Map.of(
                                    "id",
                                    Map.of(
                                            "type",
                                            "string",
                                            "enum",
                                            List.of(
                                                    // Step 1 — empresa
                                                    "f-name", "f-sector", "f-size", "f-horizon",
                                                    "f-market", "f-challenge", "f-strengths",
                                                    "f-consultant-name", "f-consultant-company",
                                                    // Step 2 — global STEEP
                                                    "gs-s", "gs-t", "gs-e", "gs-env", "gs-p",
                                                    // Step 3 — sectorial STEEP
                                                    "steep-s", "steep-t", "steep-e", "steep-env", "steep-p",
                                                    // Step 4 — horizon
                                                    "hs-h1", "hs-h2", "hs-h3"),
                                            "description", "Identificador del campo del formulario"),
                                    "value",
                                    Map.of("type", "string", "description", "Texto sugerido"),
                                    "mode",
                                    Map.of(
                                            "type", "string",
                                            "enum", List.of("add", "replace"),
                                            "description", "'add' añade al final, 'replace' sobreescribe")),
                            "required", List.of("id", "value", "mode"))),
            tool(
                    "generateGlobalSteep",
                    "Lanza la generación del STEEP mundial (paso 2). Acción costosa — confirma con el"
                            + " usuario antes de emitir.",
                    Map.of("type", "object", "properties", Map.of())),
            tool(
                    "runAnalysis",
                    "Lanza el análisis de foresight completo. Acción costosa (5 llamadas a Claude) —"
                            + " confirma siempre con el usuario antes de emitir.",
                    Map.of("type", "object", "properties", Map.of())),
            tool(
                    "wizardNext",
                    "Avanza al siguiente paso del wizard (1→2, 2→3, 3→4). En el paso 4 lanza un error;"
                            + " usa runAnalysis si el usuario quiere generar el informe.",
                    Map.of("type", "object", "properties", Map.of())),
            tool(
                    "wizardBack",
                    "Retrocede un paso en el wizard (4→3, 3→2, 2→1). En el paso 1 lanza un error.",
                    Map.of("type", "object", "properties", Map.of())),
            tool(
                    "shareReport",
                    "Abre el modal para compartir el informe (genera enlace público con TTL 7 días).",
                    Map.of(
                            "type", "object",
                            "properties", Map.of(
                                    "id", Map.of("type", "string", "description", "UUID opcional del informe")),
                            "required", List.of())),
            tool(
                    "exportPDF",
                    "Exporta el informe actual o el indicado por id como PDF.",
                    Map.of(
                            "type", "object",
                            "properties", Map.of(
                                    "id", Map.of("type", "string", "description", "UUID opcional del informe")),
                            "required", List.of())),
            tool(
                    "exportPPT",
                    "Exporta el informe actual o el indicado por id como PowerPoint editable.",
                    Map.of(
                            "type", "object",
                            "properties", Map.of(
                                    "id", Map.of("type", "string", "description", "UUID opcional del informe")),
                            "required", List.of())),
            tool(
                    "logout",
                    "Cierra la sesión del usuario y le redirige al login. Acción destructiva — confirma"
                            + " verbalmente con el usuario antes de emitir.",
                    Map.of("type", "object", "properties", Map.of())));

    /** Builds a single tool entry in Anthropic's expected shape. */
    private static Map<String, Object> tool(String name, String description, Map<String, Object> inputSchema) {
        return Map.of(
                "name", name,
                "description", description,
                "input_schema", inputSchema);
    }
}
