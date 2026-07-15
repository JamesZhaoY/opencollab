package com.opencollab.dto;

import lombok.Data;

import javax.validation.constraints.NotNull;

@Data
public class RevokePermissionRequest {
    @NotNull(message = "用户不能为空")
    private Long userId;

    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
}
