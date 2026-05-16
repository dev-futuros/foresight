package com.foresight.backend.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.foresight.backend.common.exception.NotFoundException;
import com.foresight.backend.common.security.KindeBackendClient;

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
        user = User.builder()
                .externalUserId("user_external_" + userId)
                .name("Original Name")
                .role(UserRole.USER)
                .language("es")
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
    void updateProfileChangesOnlyNonNullFields() {
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(userRepository.save(user)).thenReturn(user);

        User result = userService.updateProfile(userId, "New Name", "en");

        assertThat(result.getName()).isEqualTo("New Name");
        assertThat(result.getLanguage()).isEqualTo("en");
        verify(userRepository).save(user);
    }

    @Test
    void updateProfileIgnoresNullFields() {
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(userRepository.save(user)).thenReturn(user);

        userService.updateProfile(userId, null, null);

        assertThat(user.getName()).isEqualTo("Original Name");
        assertThat(user.getLanguage()).isEqualTo("es");
    }

    @Test
    void updateProfileThrowsWhenUserMissing() {
        when(userRepository.findById(userId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> userService.updateProfile(userId, "name", "en"))
                .isInstanceOf(NotFoundException.class);

        verify(userRepository, never()).save(org.mockito.ArgumentMatchers.any());
    }
}
