package com.foresight.backend.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.foresight.backend.common.exception.NotFoundException;
import com.foresight.backend.common.security.DevPrincipal;
import com.foresight.backend.common.security.KindeBackendClient;
import com.foresight.backend.user.dto.UserResponse;

@ExtendWith(MockitoExtension.class)
class UserServiceTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private KindeBackendClient kindeBackendClient;

    @InjectMocks
    private UserService userService;

    private UUID userId;
    private User user;

    @BeforeEach
    void setup() {
        userId = UUID.randomUUID();
        // Local row is thin now — only externalUserId + role. The name/email/picture
        // values asserted below come from the mocked KindeBackendClient, not the entity.
        user = User.builder()
                .externalUserId("kp_test_" + userId)
                .role(UserRole.USER)
                .build();
        user.setId(userId);
    }

    @Test
    void getByIdReturnsUserWhenFound() {
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));

        assertThat(userService.getById(userId)).isSameAs(user);
    }

    @Test
    void getByIdThrowsWhenMissing() {
        when(userRepository.findById(userId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> userService.getById(userId))
                .isInstanceOf(NotFoundException.class)
                .hasMessage("User not found");
    }

    @Test
    void getProfileComposesFromKindeStockAndProperties() {
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(kindeBackendClient.fetchUser(user.getExternalUserId()))
                .thenReturn(Optional.of(new KindeBackendClient.KindeUser(
                        "kp_remote", "Alice", "Anders", "alice@example.com", "https://cdn/pic.png")));
        when(kindeBackendClient.fetchUserProperties(user.getExternalUserId()))
                .thenReturn(Map.of(UserService.LANGUAGE_PROPERTY_KEY, "en"));

        UserResponse profile = userService.getProfile(userId);

        assertThat(profile.id()).isEqualTo(userId);
        assertThat(profile.name()).isEqualTo("Alice Anders");
        assertThat(profile.email()).isEqualTo("alice@example.com");
        assertThat(profile.picture()).isEqualTo("https://cdn/pic.png");
        assertThat(profile.role()).isEqualTo(UserRole.USER);
        assertThat(profile.language()).isEqualTo("en");
    }

    @Test
    void getProfileDefaultsLanguageWhenPropertyMissing() {
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(kindeBackendClient.fetchUser(user.getExternalUserId())).thenReturn(Optional.empty());
        when(kindeBackendClient.fetchUserProperties(user.getExternalUserId())).thenReturn(Map.of());

        UserResponse profile = userService.getProfile(userId);

        assertThat(profile.language()).isEqualTo(UserService.DEFAULT_LANGUAGE);
        assertThat(profile.name()).isNull();
        assertThat(profile.email()).isNull();
    }

    @Test
    void getProfileShortCircuitsForDevUser() {
        User dev = User.builder().externalUserId(DevPrincipal.EXTERNAL_USER_ID).role(UserRole.USER).build();
        dev.setId(DevPrincipal.ID);
        when(userRepository.findById(DevPrincipal.ID)).thenReturn(Optional.of(dev));

        UserResponse profile = userService.getProfile(DevPrincipal.ID);

        // No Kinde calls at all for the synthetic dev user — verified by the never()s.
        verify(kindeBackendClient, never()).fetchUser(anyString());
        verify(kindeBackendClient, never()).fetchUserProperties(anyString());
        assertThat(profile.name()).isEqualTo(DevPrincipal.NAME);
        assertThat(profile.language()).isEqualTo(UserService.DEFAULT_LANGUAGE);
    }

    @Test
    void updateProfilePushesNameToKindeStockAndLanguageToProperty() {
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        // getProfile re-fetch at the end of updateProfile needs these mocks too.
        when(kindeBackendClient.fetchUser(user.getExternalUserId())).thenReturn(Optional.empty());
        when(kindeBackendClient.fetchUserProperties(user.getExternalUserId())).thenReturn(Map.of());

        userService.updateProfile(userId, "New Name", "en");

        verify(kindeBackendClient).updateUser(user.getExternalUserId(), "New Name");
        verify(kindeBackendClient)
                .updateUserProperties(user.getExternalUserId(), Map.of(UserService.LANGUAGE_PROPERTY_KEY, "en"));
    }

    @Test
    void updateProfileSkipsKindeWritesForNullFields() {
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(kindeBackendClient.fetchUser(user.getExternalUserId())).thenReturn(Optional.empty());
        when(kindeBackendClient.fetchUserProperties(user.getExternalUserId())).thenReturn(Map.of());

        userService.updateProfile(userId, null, null);

        verify(kindeBackendClient, never()).updateUser(anyString(), anyString());
        verify(kindeBackendClient, never()).updateUserProperties(anyString(), any());
    }

    @Test
    void updateProfileSkipsKindeEntirelyForDevUser() {
        User dev = User.builder().externalUserId(DevPrincipal.EXTERNAL_USER_ID).role(UserRole.USER).build();
        dev.setId(DevPrincipal.ID);
        when(userRepository.findById(DevPrincipal.ID)).thenReturn(Optional.of(dev));

        userService.updateProfile(DevPrincipal.ID, "Whatever", "en");

        verify(kindeBackendClient, never()).updateUser(anyString(), anyString());
        verify(kindeBackendClient, never()).updateUserProperties(anyString(), any());
    }

    @Test
    void updateProfileThrowsWhenUserMissing() {
        when(userRepository.findById(userId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> userService.updateProfile(userId, "name", "en"))
                .isInstanceOf(NotFoundException.class);

        verify(kindeBackendClient, never()).updateUser(anyString(), anyString());
        verify(kindeBackendClient, never()).updateUserProperties(anyString(), any());
    }
}
