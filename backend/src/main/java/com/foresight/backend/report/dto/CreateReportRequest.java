package com.foresight.backend.report.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Request body for {@code POST /api/reports}.
 *
 * @param title     user-chosen title (max 500 chars)
 * @param inputData arbitrary JSON document capturing the wizard inputs (company profile,
 *                  STEEP factors, horizon signals). Shape is intentionally flexible.
 */
public record CreateReportRequest(@NotBlank @Size(max = 500) String title, @NotNull JsonNode inputData) {}
