package com.opencollab.dto;

import lombok.Data;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;

@Data
public class GrantPermissionRequest {
    @NotNull(message = "文件不能为空")
    private Long fileId;

    @NotNull(message = "用户不能为空")
    private Long userId;

    @NotBlank(message = "权限不能为空")
    private String permission;

    public Long getFileId() { return fileId; }
    public void setFileId(Long fileId) { this.fileId = fileId; }
    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
    public String getPermission() { return permission; }
    public void setPermission(String permission) { this.permission = permission; }
}
