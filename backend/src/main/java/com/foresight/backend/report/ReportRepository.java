package com.foresight.backend.report;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Spring Data repository for {@link Report}.
 *
 * <p>Every query is scoped by {@code userId} to enforce ownership at the data layer — there is
 * no method that returns reports regardless of owner. Admin use cases will get a separate
 * repository / query path.
 */
public interface ReportRepository extends JpaRepository<Report, UUID> {

    /**
     * Lists reports owned by a user, newest first.
     *
     * @param userId   owner UUID
     * @param pageable pagination + sort (sort is overridden by the method name ordering)
     * @return a page of reports belonging to the user
     */
    Page<Report> findByUserIdOrderByCreatedAtDesc(UUID userId, Pageable pageable);

    /**
     * Fetches a single report iff it belongs to the given user.
     *
     * @param id     report UUID
     * @param userId owner UUID
     * @return the report if it exists and belongs to the user; empty otherwise
     */
    Optional<Report> findByIdAndUserId(UUID id, UUID userId);
}
