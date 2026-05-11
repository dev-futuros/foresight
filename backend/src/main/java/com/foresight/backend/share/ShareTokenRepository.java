package com.foresight.backend.share;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ShareTokenRepository extends JpaRepository<ShareToken, UUID> {

    /**
     * Locates a share by its public token string. Expiry is checked at the service
     * layer so this stays a simple key lookup.
     */
    Optional<ShareToken> findByToken(String token);
}
