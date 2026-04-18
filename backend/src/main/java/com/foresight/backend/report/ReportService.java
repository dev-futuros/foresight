package com.foresight.backend.report;

import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.foresight.backend.common.exception.NotFoundException;
import com.foresight.backend.report.dto.CreateReportRequest;
import com.foresight.backend.report.dto.UpdateReportRequest;

import lombok.RequiredArgsConstructor;

/**
 * Business logic for CRUD operations on {@link Report}.
 *
 * <p>Ownership is enforced on every read/write by requiring the caller's {@code userId} to
 * be passed in and using {@link ReportRepository#findByIdAndUserId} — this prevents
 * accidental cross-user access at the data layer, not just at the controller layer.
 */
@Service
@RequiredArgsConstructor
public class ReportService {

    private final ReportRepository reportRepository;

    /**
     * Creates a new {@link ReportStatus#DRAFT} report for the given user.
     *
     * @param userId  owner UUID
     * @param request validated creation payload
     * @return the persisted report
     */
    @Transactional
    public Report create(UUID userId, CreateReportRequest request) {
        Report report = Report.builder()
                .userId(userId)
                .title(request.title())
                .status(ReportStatus.DRAFT)
                .inputData(request.inputData())
                .build();
        return reportRepository.save(report);
    }

    /**
     * Lists the given user's reports, newest first.
     *
     * @param userId   owner UUID
     * @param pageable pagination info
     * @return page of reports owned by the user
     */
    @Transactional(readOnly = true)
    public Page<Report> list(UUID userId, Pageable pageable) {
        return reportRepository.findByUserIdOrderByCreatedAtDesc(userId, pageable);
    }

    /**
     * Fetches a single report, enforcing ownership.
     *
     * @param id     report UUID
     * @param userId owner UUID (must match the report's owner)
     * @return the report
     * @throws NotFoundException if the report does not exist or belongs to another user
     */
    @Transactional(readOnly = true)
    public Report getOwned(UUID id, UUID userId) {
        return reportRepository
                .findByIdAndUserId(id, userId)
                .orElseThrow(() -> new NotFoundException("Report not found"));
    }

    /**
     * Partially updates a report the caller owns. {@code null} fields in the request are
     * ignored.
     *
     * @param id      report UUID
     * @param userId  owner UUID
     * @param request validated partial update
     * @return the updated report
     * @throws NotFoundException if the report does not exist or belongs to another user
     */
    @Transactional
    public Report update(UUID id, UUID userId, UpdateReportRequest request) {
        Report report = getOwned(id, userId);
        if (request.title() != null) report.setTitle(request.title());
        if (request.inputData() != null) report.setInputData(request.inputData());
        if (request.resultData() != null) report.setResultData(request.resultData());
        return reportRepository.save(report);
    }

    /**
     * Deletes a report the caller owns.
     *
     * @param id     report UUID
     * @param userId owner UUID
     * @throws NotFoundException if the report does not exist or belongs to another user
     */
    @Transactional
    public void delete(UUID id, UUID userId) {
        Report report = getOwned(id, userId);
        reportRepository.delete(report);
    }
}
