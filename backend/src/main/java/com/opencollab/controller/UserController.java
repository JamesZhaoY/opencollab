package com.opencollab.controller;

import com.opencollab.dto.*;
import com.opencollab.service.AuthService;
import com.opencollab.service.UserService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import javax.validation.Valid;
import java.util.List;

@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserService userService;
    private final AuthService authService;

    public UserController(UserService userService, AuthService authService) {
        this.userService = userService;
        this.authService = authService;
    }

    @GetMapping
    public Result<List<UserResponse>> getAllUsers() {
        return Result.success(userService.getAllUsers());
    }

    @GetMapping("/search")
    public Result<List<UserResponse>> searchUsers(@RequestParam String q, @AuthenticationPrincipal UserDetails userDetails) {
        return Result.success(userService.searchUsers(q));
    }

    @GetMapping("/{id}")
    public Result<UserResponse> getUserById(@PathVariable Long id) {
        return Result.success(userService.getUserById(id));
    }

    @PutMapping("/password")
    public Result<String> changePassword(@Valid @RequestBody ChangePasswordRequest request,
                                       @AuthenticationPrincipal UserDetails userDetails) {
        authService.changePassword(userDetails.getUsername(), request.getOldPassword(), request.getNewPassword());
        return Result.success("Password changed successfully");
    }
}