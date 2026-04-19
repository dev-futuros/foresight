package com.foresight.backend.report;

import java.util.UUID;

import jakarta.validation.Valid;

import org.springdoc.core.annotations.ParameterObject;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import com.foresight.backend.common.security.AuthenticatedUser;
import com.foresight.backend.common.security.CurrentUser;
import com.foresight.backend.report.dto.CreateReportRequest;
import com.foresight.backend.report.dto.ReportResponse;
import com.foresight.backend.report.dto.ReportSummary;
import com.foresight.backend.report.dto.UpdateReportRequest;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import lombok.RequiredArgsConstructor;

/**
 * REST endpoints for managing foresight reports.
 *
 * <p>All routes require a valid JWT. Every operation is implicitly scoped to the authenticated
 * user — there is no way to reach another user's reports through this controller.
 */
@RestController
@RequestMapping("/api/reports")
@RequiredArgsConstructor
public class ReportController {

    private final ReportService reportService;

    /**
     * Creates a new report for the caller.
     *
     * @param principal authenticated caller
     * @param request   validated creation payload
     * @return HTTP 201 with the created report's full projection
     */
    @PostMapping
    public ResponseEntity<ReportResponse> create(
            @CurrentUser AuthenticatedUser principal, @Valid @RequestBody CreateReportRequest request) {
        return ResponseEntity.status(201).body(ReportResponse.from(reportService.create(principal.id(), request)));
    }

    /**
     * Lists the caller's reports. Pagination is driven by standard Spring query parameters.
     *
     * @param principal authenticated caller
     * @param pageable  pagination info (Spring resolves {@code page}, {@code size}, {@code sort}
     *                  automatically)
     * @return a page of lightweight report summaries
     */
    @Operation(
            summary = "List the caller's reports",
            description =
                    """
                    Paginated list of the authenticated user's reports, lightweight projection (no inputData/resultData blobs).

                    **Pagination parameters** (all optional):
                    - `page`  — zero-indexed page number. Default: `0`.
                    - `size`  — page size. Default: `20`. Typical max: `100`.
                    - `sort`  — `property,(asc|desc)`. Repeat the parameter to sort by multiple properties.
                              Valid properties: `createdAt`, `updatedAt`, `title`, `status`.
                              Examples: `createdAt,desc` (default-ish) · `title,asc` · `status,asc&sort=createdAt,desc`.
                    """)
    @GetMapping
    public Page<ReportSummary> list(
            @CurrentUser AuthenticatedUser principal,
            @Parameter(example = "createdAt,desc") @ParameterObject Pageable pageable) {
        return reportService.list(principal.id(), pageable).map(ReportSummary::from);
    }

    /**
     * Returns the full detail of one of the caller's reports.
     *
     * @param principal authenticated caller
     * @param id        report UUID
     * @return the report's full projection
     */
    @GetMapping("/{id}")
    public ReportResponse get(@CurrentUser AuthenticatedUser principal, @PathVariable UUID id) {
        return ReportResponse.from(reportService.getOwned(id, principal.id()));
    }

    /**
     * Partially updates a report owned by the caller.
     *
     * @param principal authenticated caller
     * @param id        report UUID
     * @param request   validated partial update
     * @return the updated report's full projection
     */
    @PatchMapping("/{id}")
    public ReportResponse update(
            @CurrentUser AuthenticatedUser principal,
            @PathVariable UUID id,
            @Valid @RequestBody UpdateReportRequest request) {
        return ReportResponse.from(reportService.update(id, principal.id(), request));
    }

    /**
     * Deletes a report owned by the caller.
     *
     * @param principal authenticated caller
     * @param id        report UUID
     * @return HTTP 204 on success
     */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@CurrentUser AuthenticatedUser principal, @PathVariable UUID id) {
        reportService.delete(id, principal.id());
        return ResponseEntity.noContent().build();
    }
}
