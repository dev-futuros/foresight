package com.foresight.backend.report;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.foresight.backend.common.exception.NotFoundException;
import com.foresight.backend.report.dto.CreateReportRequest;
import com.foresight.backend.report.dto.UpdateReportRequest;

@ExtendWith(MockitoExtension.class)
class ReportServiceTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Mock
    private ReportRepository reportRepository;

    @InjectMocks
    private ReportService reportService;

    private UUID userId;
    private UUID reportId;
    private Report report;
    private JsonNode inputData;

    @BeforeEach
    void setup() throws Exception {
        userId = UUID.randomUUID();
        reportId = UUID.randomUUID();
        inputData = MAPPER.readTree("{\"company\":\"Acme\"}");
        report = Report.builder()
                .userId(userId)
                .title("My Report")
                .status(ReportStatus.DRAFT)
                .inputData(inputData)
                .build();
        report.setId(reportId);
    }

    @Test
    void createPersistsNewDraftReport() {
        when(reportRepository.save(any(Report.class))).thenAnswer(inv -> {
            Report r = inv.getArgument(0);
            r.setId(reportId);
            return r;
        });

        Report created = reportService.create(userId, new CreateReportRequest("Title", inputData));

        ArgumentCaptor<Report> captor = ArgumentCaptor.forClass(Report.class);
        verify(reportRepository).save(captor.capture());
        Report saved = captor.getValue();
        assertThat(saved.getUserId()).isEqualTo(userId);
        assertThat(saved.getTitle()).isEqualTo("Title");
        assertThat(saved.getStatus()).isEqualTo(ReportStatus.DRAFT);
        assertThat(saved.getInputData()).isEqualTo(inputData);
        assertThat(created.getId()).isEqualTo(reportId);
    }

    @Test
    void listDelegatesToRepositoryWithUserScope() {
        Pageable pageable = PageRequest.of(0, 20);
        Page<Report> page = new PageImpl<>(List.of(report));
        when(reportRepository.findByUserIdOrderByCreatedAtDesc(userId, pageable))
                .thenReturn(page);

        Page<Report> result = reportService.list(userId, pageable);

        assertThat(result.getContent()).containsExactly(report);
    }

    @Test
    void getOwnedReturnsReportWhenOwnedByUser() {
        when(reportRepository.findByIdAndUserId(reportId, userId)).thenReturn(Optional.of(report));

        assertThat(reportService.getOwned(reportId, userId)).isSameAs(report);
    }

    @Test
    void getOwnedThrowsWhenReportBelongsToAnotherUser() {
        UUID attackerId = UUID.randomUUID();
        when(reportRepository.findByIdAndUserId(reportId, attackerId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> reportService.getOwned(reportId, attackerId))
                .isInstanceOf(NotFoundException.class)
                .hasMessage("Report not found");
    }

    @Test
    void updateAppliesOnlyNonNullFields() throws Exception {
        JsonNode newResult = MAPPER.readTree("{\"result\":42}");
        when(reportRepository.findByIdAndUserId(reportId, userId)).thenReturn(Optional.of(report));
        when(reportRepository.save(report)).thenReturn(report);

        Report updated = reportService.update(reportId, userId, new UpdateReportRequest("New Title", null, newResult));

        assertThat(updated.getTitle()).isEqualTo("New Title");
        assertThat(updated.getInputData()).isEqualTo(inputData); // unchanged
        assertThat(updated.getResultData()).isEqualTo(newResult);
    }

    @Test
    void updateThrowsWhenNotOwned() {
        when(reportRepository.findByIdAndUserId(reportId, userId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> reportService.update(reportId, userId, new UpdateReportRequest("x", null, null)))
                .isInstanceOf(NotFoundException.class);

        verify(reportRepository, never()).save(any());
    }

    @Test
    void deleteRemovesOwnedReport() {
        when(reportRepository.findByIdAndUserId(reportId, userId)).thenReturn(Optional.of(report));

        reportService.delete(reportId, userId);

        verify(reportRepository).delete(report);
    }

    @Test
    void deleteThrowsWhenNotOwned() {
        when(reportRepository.findByIdAndUserId(reportId, userId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> reportService.delete(reportId, userId)).isInstanceOf(NotFoundException.class);

        verify(reportRepository, never()).delete(any(Report.class));
    }
}
