package com.foresight.backend.example;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Spring Data repository for {@link Example}. Examples are global content
 * (no per-user filter), so the queries here intentionally lack a
 * {@code userId} parameter — list returns everything, ordered newest first.
 */
public interface ExampleRepository extends JpaRepository<Example, UUID> {

    /** All examples, newest first. Used by the dashboard list endpoint. */
    List<Example> findAllByOrderByCreatedAtDesc();

    /** Look up by stable slug — used by the promote-by-upsert path. */
    Optional<Example> findBySlug(String slug);
}
