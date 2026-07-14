package com.opencollab.dto;

import lombok.Data;

import javax.validation.constraints.NotNull;

@Data
public class RevokePermissionRequest {
    @NotNull(message = "User ID is required")
    private Long userId;

    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
}
