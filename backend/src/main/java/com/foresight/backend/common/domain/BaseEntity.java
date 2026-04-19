package com.foresight.backend.common.domain;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.Id;
import jakarta.persistence.MappedSuperclass;

import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import lombok.Getter;
import lombok.Setter;

/**
 * Base class for every JPA entity in the application.
 *
 * <p>Provides three shared fields:
 * <ul>
 *   <li>{@link #id}: a {@link UUID} primary key assigned on construction so entities can be
 *       referenced before they are persisted. UUIDs are preferred over sequential IDs for
 *       scalability (no coordination in distributed systems) and security (no enumeration).</li>
 *   <li>{@link #createdAt}: set by Spring Data JPA auditing on insert; never updated.</li>
 *   <li>{@link #updatedAt}: refreshed by Spring Data JPA auditing on each update.</li>
 * </ul>
 *
 * <p>Auditing is wired globally by {@code @EnableJpaAuditing} in the application entry point
 * and locally by {@code @EntityListeners(AuditingEntityListener.class)} on this class.
 */
@Getter
@Setter
@MappedSuperclass
@EntityListeners(AuditingEntityListener.class)
public abstract class BaseEntity {

    /** Primary key. Generated at construction time to keep identity stable before persistence. */
    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    /** Timestamp set once, when the row is first inserted. */
    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    /** Timestamp refreshed on every update. */
    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    /**
     * Default constructor used by JPA and by application code.
     * Pre-populates {@link #id} with a random UUID if none is set, so the entity
     * already has a stable identity before being saved.
     */
    public BaseEntity() {
        if (this.id == null) {
            this.id = UUID.randomUUID();
        }
    }
}
