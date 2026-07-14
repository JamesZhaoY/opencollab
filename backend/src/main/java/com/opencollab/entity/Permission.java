package com.opencollab.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;

import java.time.LocalDateTime;

@Data
@TableName("file_permissions")
@NoArgsConstructor
@AllArgsConstructor
public class Permission {

    @TableId(type = IdType.AUTO)
    private Long id;

    @TableField("file_id")
    private Long fileId;

    @TableField("user_id")
    private Long userId;

    @TableField("permission")
    private String permission;

    @TableField("granted_by")
    private Long grantedBy;

    @TableField(value = "created_at", fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    // 为了在没有 Lombok 编译的情况下提供显式 getter/setter
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getFileId() { return fileId; }
    public void setFileId(Long fileId) { this.fileId = fileId; }
    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
    public String getPermission() { return permission; }
    public void setPermission(String permission) { this.permission = permission; }
    public Long getGrantedBy() { return grantedBy; }
    public void setGrantedBy(Long grantedBy) { this.grantedBy = grantedBy; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
