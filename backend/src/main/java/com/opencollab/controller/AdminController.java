package com.opencollab.controller;

import com.opencollab.dto.*;
import com.opencollab.service.UserService;
import org.springframework.web.bind.annotation.*;

import javax.validation.Valid;
import java.util.List;

@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private final UserService userService;

    public AdminController(UserService userService) {
        this.userService = userService;
    }

    @GetMapping("/users")
    public Result<List<UserResponse>> getAllUsers() {
        return Result.success(userService.getAllUsers());
    }

    @PostMapping("/users")
    public Result<UserResponse> createUser(@Valid @RequestBody AdminCreateUserRequest request) {
        return Result.success(userService.createUser(request));
    }

    @PutMapping("/users/{id}")
    public Result<UserResponse> updateUser(@PathVariable Long id, @RequestBody UserUpdateRequest request) {
        return Result.success(userService.updateUser(id, request));
    }

    @DeleteMapping("/users/{id}")
    public Result<Void> deleteUser(@PathVariable Long id) {
        userService.deleteUser(id);
        return Result.success();
    }

    @PostMapping("/users/{id}/reset-password")
    public Result<Void> resetPassword(@PathVariable Long id,
                                      @Valid @RequestBody ResetPasswordRequest request) {
        userService.resetPassword(id, request.getNewPassword());
        return Result.success();
    }
}
