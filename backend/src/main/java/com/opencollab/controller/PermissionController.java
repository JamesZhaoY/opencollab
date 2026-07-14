package com.opencollab.controller;

import com.opencollab.dto.*;
import com.opencollab.entity.User;
import com.opencollab.security.CustomUserDetailsService;
import com.opencollab.service.PermissionService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import javax.validation.Valid;
import java.util.List;

@RestController
@RequestMapping("/api/permissions")
public class PermissionController {

    private final PermissionService permissionService;
    private final CustomUserDetailsService userDetailsService;

    public PermissionController(PermissionService permissionService, CustomUserDetailsService userDetailsService) {
        this.permissionService = permissionService;
        this.userDetailsService = userDetailsService;
    }

    @GetMapping("/file/{fileId}")
    public Result<List<PermissionResponse>> getPermissionsForFile(
            @PathVariable Long fileId,
            @AuthenticationPrincipal UserDetails userDetails) {
        User user = userDetailsService.getUserByUsername(userDetails.getUsername());
        return Result.success(permissionService.getPermissionsForFile(fileId, user.getId()));
    }

    @PostMapping
    public Result<PermissionResponse> grantPermission(
            @Valid @RequestBody GrantPermissionRequest request,
            @AuthenticationPrincipal UserDetails userDetails) {
        User user = userDetailsService.getUserByUsername(userDetails.getUsername());
        return Result.success(permissionService.grantPermission(request, user.getId()));
    }

    @DeleteMapping("/file/{fileId}/user/{userId}")
    public Result<Void> revokePermission(
            @PathVariable Long fileId,
            @PathVariable Long userId,
            @AuthenticationPrincipal UserDetails userDetails) {
        User user = userDetailsService.getUserByUsername(userDetails.getUsername());
        permissionService.revokePermission(fileId, userId, user.getId());
        return Result.success();
    }
}