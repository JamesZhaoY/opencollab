package com.opencollab.controller;

import com.opencollab.dto.ChangePasswordRequest;
import com.opencollab.dto.LoginRequest;
import com.opencollab.dto.LogoutRequest;
import com.opencollab.dto.RefreshTokenRequest;
import com.opencollab.dto.RegisterRequest;
import com.opencollab.dto.Result;
import com.opencollab.dto.TokenResponse;
import com.opencollab.dto.UserResponse;
import com.opencollab.security.JwtTokenProvider;
import com.opencollab.service.AuthService;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import javax.servlet.http.HttpServletRequest;
import javax.validation.Valid;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;
    private final JwtTokenProvider jwtTokenProvider;

    public AuthController(AuthService authService, JwtTokenProvider jwtTokenProvider) {
        this.authService = authService;
        this.jwtTokenProvider = jwtTokenProvider;
    }

    @PostMapping("/login")
    public Result<TokenResponse> login(@Valid @RequestBody LoginRequest request) {
        return Result.success(authService.login(request));
    }

    @PostMapping("/register")
    public Result<UserResponse> register(@Valid @RequestBody RegisterRequest request) {
        return Result.success(authService.register(request));
    }

    @PostMapping("/refresh")
    public Result<TokenResponse> refreshToken(@Valid @RequestBody RefreshTokenRequest request) {
        return Result.success(authService.refreshToken(request.getRefreshToken()));
    }

    @GetMapping("/me")
    public Result<UserResponse> getCurrentUser(
            @AuthenticationPrincipal UserDetails userDetails) {
        return Result.success(authService.getCurrentUser(userDetails.getUsername()));
    }

    @PostMapping("/logout")
    public Result<Void> logout(HttpServletRequest request,
                               @RequestBody(required = false) LogoutRequest body) {
        String bearer = request.getHeader("Authorization");
        if (bearer != null && bearer.startsWith("Bearer ")) {
            jwtTokenProvider.revokeToken(bearer.substring(7));
        }
        if (body != null && body.getRefreshToken() != null && !body.getRefreshToken().isEmpty()) {
            jwtTokenProvider.revokeToken(body.getRefreshToken(), jwtTokenProvider.getRefreshExpiration());
        }
        return Result.success();
    }

    @PostMapping("/change-password")
    public Result<Void> changePassword(@Valid @RequestBody ChangePasswordRequest request,
                                       @AuthenticationPrincipal UserDetails userDetails) {
        authService.changePassword(userDetails.getUsername(), request.getOldPassword(), request.getNewPassword());
        return Result.success();
    }
}