package com.foresight.backend.report;

import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;

import org.hibernate.annotations.Type;

import com.fasterxml.jackson.databind.JsonNode;
import com.foresight.backend.common.domain.BaseEntity;

import io.hypersistence.utils.hibernate.type.json.JsonBinaryType;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * JPA entity representing a strategic foresight report owned by a single user.
 *
 * <p>Both the user-supplied inputs (company profile, STEEP factors, horizon signals) and the
 * AI-generated output are stored as PostgreSQL {@code JSONB} columns via {@code JsonBinaryType}.
 * This gives us schema flexibility — the input/output shape can evolve without a migration —
 * while still letting PostgreSQL index and query fields inside the JSON if needed later.
 *
 * <p>Ownership is enforced by a plain {@code user_id} column and checked at query time in
 * {@link ReportService} to keep cross-user leaks impossible at the data layer.
 */
@Entity
@Table(name = "reports")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Report extends BaseEntity {

    /** UUID of the {@link com.foresight.backend.user.User} who owns this report. */
    @Column(name = "user_id", nullable = false)
    private UUID userId;

    /** Human-readable title (shown in the dashboard list). */
    @Column(nullable = false, length = 500)
    private String title;

    /** Current lifecycle status. See {@link ReportStatus}. */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ReportStatus status;

    /**
     * User-provided inputs as a JSONB document: typically {@code companyProfile},
     * {@code steep}, and {@code horizon} sub-objects.
     */
    @Type(JsonBinaryType.class)
    @Column(name = "input_data", nullable = false, columnDefinition = "jsonb")
    private JsonNode inputData;

    /**
     * AI-generated report body as a JSONB document. {@code null} until analysis completes.
     */
    @Type(JsonBinaryType.class)
    @Column(name = "result_data", columnDefinition = "jsonb")
    private JsonNode resultData;
}
