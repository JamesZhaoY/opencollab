package com.opencollab.dto;

import lombok.Data;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;

@Data
public class GrantFilePermissionRequest {
    @NotNull(message = "User ID is required")
    private Long userId;

    @NotBlank(message = "Permission is required")
    private String permission;

    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
    public String getPermission() { return permission; }
    public void setPermission(String permission) { this.permission = permission; }
}
