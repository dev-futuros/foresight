package com.foresight.backend.billing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.foresight.backend.billing.KindeAccountApiClient.KindeEntitlement;
import com.foresight.backend.billing.KindeAccountApiClient.KindeEntitlements;
import com.foresight.backend.billing.KindeAccountApiClient.KindePlan;
import com.foresight.backend.billing.dto.BillingProfileResponse;
import com.foresight.backend.common.security.DevPrincipal;
import com.foresight.backend.common.security.KindeBackendClient;

@ExtendWith(MockitoExtension.class)
class BillingServiceTest {

    @Mock
    private KindeAccountApiClient kindeAccountApiClient;

    @Mock
    private KindeBackendClient kindeBackendClient;

    @InjectMocks
    private BillingService billingService;

    private UUID userId;
    private String externalUserId;
    private String accessToken;

    @BeforeEach
    void setup() {
        userId = UUID.randomUUID();
        externalUserId = "kp_test_" + userId;
        accessToken = "fake-jwt";
    }

    // ── getProfile ───────────────────────────────────────────────────────────

    @Test
    void getProfileShortCircuitsForDevUser() {
        BillingProfileResponse profile = billingService.getProfile(userId, DevPrincipal.EXTERNAL_USER_ID, "ignored");

        verify(kindeAccountApiClient, never()).fetchEntitlements(anyString());
        verify(kindeBackendClient, never()).fetchUserProperties(anyString());
        assertThat(profile.plan()).isEqualTo(BillingService.DEV_PLAN_KEY);
        assertThat(profile.reportsLimit()).isEqualTo(Integer.MAX_VALUE);
    }

    @Test
    void getProfileReturnsNullPlanWhenKindeHasNoSubscription() {
        when(kindeAccountApiClient.fetchEntitlements(accessToken))
                .thenReturn(Optional.of(new KindeEntitlements(List.of(), "org_x", List.of())));

        BillingProfileResponse profile = billingService.getProfile(userId, externalUserId, accessToken);

        assertThat(profile.plan()).isNull();
        assertThat(profile.reportsLimit()).isNull();
        verify(kindeBackendClient, never()).fetchUserProperties(anyString());
    }

    @Test
    void getProfileReadsCounterFromKindePropertiesWhenPeriodMatches() {
        Instant subscribedOn = Instant.now().minus(5, ChronoUnit.DAYS);
        when(kindeAccountApiClient.fetchEntitlements(accessToken)).thenReturn(Optional.of(activePlanEntitlements(subscribedOn, 10)));
        // periodStart will equal subscribedOn (less than 1 month elapsed → 0 monthly anchors past).
        when(kindeBackendClient.fetchUserProperties(externalUserId))
                .thenReturn(Map.of(
                        BillingService.USED_PROPERTY_KEY, "3",
                        BillingService.PERIOD_START_PROPERTY_KEY, subscribedOn.toString()));

        BillingProfileResponse profile = billingService.getProfile(userId, externalUserId, accessToken);

        assertThat(profile.plan()).isEqualTo("pro");
        assertThat(profile.reportsLimit()).isEqualTo(10);
        assertThat(profile.reportsUsed()).isEqualTo(3);
    }

    @Test
    void getProfileResetsCounterToZeroWhenStoredPeriodIsStale() {
        // Subscribed 45 days ago: current period rolled over once, so the stored
        // period_start from the previous period must be treated as 0 usage.
        Instant subscribedOn = Instant.now().minus(45, ChronoUnit.DAYS);
        when(kindeAccountApiClient.fetchEntitlements(accessToken)).thenReturn(Optional.of(activePlanEntitlements(subscribedOn, 10)));
        when(kindeBackendClient.fetchUserProperties(externalUserId))
                .thenReturn(Map.of(
                        BillingService.USED_PROPERTY_KEY, "8", // stale value from previous period
                        BillingService.PERIOD_START_PROPERTY_KEY, subscribedOn.toString()));

        BillingProfileResponse profile = billingService.getProfile(userId, externalUserId, accessToken);

        assertThat(profile.reportsUsed()).isZero();
    }

    @Test
    void getProfileReturnsZeroWhenPropertiesAreMissingOrMalformed() {
        Instant subscribedOn = Instant.now().minus(5, ChronoUnit.DAYS);
        when(kindeAccountApiClient.fetchEntitlements(accessToken)).thenReturn(Optional.of(activePlanEntitlements(subscribedOn, 10)));
        when(kindeBackendClient.fetchUserProperties(externalUserId)).thenReturn(Map.of());

        BillingProfileResponse profile = billingService.getProfile(userId, externalUserId, accessToken);

        assertThat(profile.reportsUsed()).isZero();
    }

    // ── recordGeneration ─────────────────────────────────────────────────────

    @Test
    void recordGenerationShortCircuitsForDevUser() {
        billingService.recordGeneration(userId, DevPrincipal.EXTERNAL_USER_ID, "ignored");

        // No Kinde calls at all for the synthetic dev user.
        verify(kindeAccountApiClient, never()).fetchEntitlements(anyString());
        verify(kindeBackendClient, never()).fetchUserProperties(anyString());
        verify(kindeBackendClient, never()).updateUserProperties(anyString(), any());
    }

    @Test
    void recordGenerationThrowsSubscriptionRequiredWhenNoPlan() {
        when(kindeAccountApiClient.fetchEntitlements(accessToken)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> billingService.recordGeneration(userId, externalUserId, accessToken))
                .isInstanceOf(SubscriptionRequiredException.class);

        verify(kindeBackendClient, never()).updateUserProperties(anyString(), any());
    }

    @Test
    void recordGenerationIncrementsCounterFromZeroOnFirstUseInPeriod() {
        Instant subscribedOn = Instant.now().minus(2, ChronoUnit.DAYS);
        when(kindeAccountApiClient.fetchEntitlements(accessToken)).thenReturn(Optional.of(activePlanEntitlements(subscribedOn, 10)));
        // No properties yet — first generation of the period.
        when(kindeBackendClient.fetchUserProperties(externalUserId)).thenReturn(Map.of());

        billingService.recordGeneration(userId, externalUserId, accessToken);

        ArgumentCaptor<Map<String, String>> captor = ArgumentCaptor.forClass(Map.class);
        verify(kindeBackendClient).updateUserProperties(eq(externalUserId), captor.capture());
        assertThat(captor.getValue())
                .containsEntry(BillingService.USED_PROPERTY_KEY, "1")
                .containsEntry(BillingService.PERIOD_START_PROPERTY_KEY, subscribedOn.toString());
        // Also pushed delta=1 to Kinde's billing meter so the Kinde Dashboard counter
        // matches the Property counter (cosmetic; foundation for overage billing).
        verify(kindeBackendClient).recordMeterUsage(externalUserId, BillingService.REPORTS_FEATURE_KEY, 1);
    }

    @Test
    void recordGenerationIncrementsCounterOnSubsequentUseInSamePeriod() {
        Instant subscribedOn = Instant.now().minus(2, ChronoUnit.DAYS);
        when(kindeAccountApiClient.fetchEntitlements(accessToken)).thenReturn(Optional.of(activePlanEntitlements(subscribedOn, 10)));
        when(kindeBackendClient.fetchUserProperties(externalUserId))
                .thenReturn(Map.of(
                        BillingService.USED_PROPERTY_KEY, "4",
                        BillingService.PERIOD_START_PROPERTY_KEY, subscribedOn.toString()));

        billingService.recordGeneration(userId, externalUserId, accessToken);

        ArgumentCaptor<Map<String, String>> captor = ArgumentCaptor.forClass(Map.class);
        verify(kindeBackendClient).updateUserProperties(eq(externalUserId), captor.capture());
        assertThat(captor.getValue()).containsEntry(BillingService.USED_PROPERTY_KEY, "5");
    }

    @Test
    void recordGenerationResetsCounterWhenPeriodRolledOver() {
        // Subscribed 35 days ago: monthsBetween = 1, so periodStart != stored stale start.
        Instant subscribedOn = Instant.now().minus(35, ChronoUnit.DAYS);
        when(kindeAccountApiClient.fetchEntitlements(accessToken)).thenReturn(Optional.of(activePlanEntitlements(subscribedOn, 10)));
        when(kindeBackendClient.fetchUserProperties(externalUserId))
                .thenReturn(Map.of(
                        BillingService.USED_PROPERTY_KEY, "9", // stale: was 9 in the old period
                        BillingService.PERIOD_START_PROPERTY_KEY, subscribedOn.toString()));

        billingService.recordGeneration(userId, externalUserId, accessToken);

        ArgumentCaptor<Map<String, String>> captor = ArgumentCaptor.forClass(Map.class);
        verify(kindeBackendClient).updateUserProperties(eq(externalUserId), captor.capture());
        // Stale 9 was discarded by the reset → first generation in new period writes "1".
        assertThat(captor.getValue()).containsEntry(BillingService.USED_PROPERTY_KEY, "1");
    }

    @Test
    void recordGenerationThrowsReportLimitExceededAtCap() {
        Instant subscribedOn = Instant.now().minus(2, ChronoUnit.DAYS);
        when(kindeAccountApiClient.fetchEntitlements(accessToken)).thenReturn(Optional.of(activePlanEntitlements(subscribedOn, 10)));
        when(kindeBackendClient.fetchUserProperties(externalUserId))
                .thenReturn(Map.of(
                        BillingService.USED_PROPERTY_KEY, "10",
                        BillingService.PERIOD_START_PROPERTY_KEY, subscribedOn.toString()));

        assertThatThrownBy(() -> billingService.recordGeneration(userId, externalUserId, accessToken))
                .isInstanceOf(ReportLimitExceededException.class)
                .satisfies(e -> {
                    ReportLimitExceededException rl = (ReportLimitExceededException) e;
                    assertThat(rl.getLimit()).isEqualTo(10);
                    assertThat(rl.getUsed()).isEqualTo(10);
                });

        // Counter MUST NOT have been written when the gate rejects.
        verify(kindeBackendClient, never()).updateUserProperties(anyString(), any());
    }

    private static KindeEntitlements activePlanEntitlements(Instant subscribedOn, int limit) {
        return new KindeEntitlements(
                List.of(new KindePlan("pro", "Futuros Pro", subscribedOn)),
                "org_x",
                List.of(new KindeEntitlement(BillingService.REPORTS_FEATURE_KEY, "Reports mensuales", limit, 0)));
    }
}
