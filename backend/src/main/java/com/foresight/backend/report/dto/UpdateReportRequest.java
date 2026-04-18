package com.foresight.backend.report.dto;

import jakarta.validation.constraints.Size;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Request body for {@code PATCH /api/reports/{id}}.
 *
 * <p>All fields are optional — {@code null} means "leave unchanged". Used both to rename a
 * report, tweak its inputs, and to attach the AI result.
 *
 * @param title      new title, or {@code null} to keep the current one
 * @param inputData  replacement inputs document, or {@code null}
 * @param resultData replacement result document (set after AI finishes), or {@code null}
 */
public record UpdateReportRequest(@Size(max = 500) String title, JsonNode inputData, JsonNode resultData) {}
