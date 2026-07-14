package com.opencollab.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class PermissionResponse {
    private Long id;
    private Long fileId;
    private String fileName;
    private Long userId;
    /** Frontend expects `username`. */
    private String username;
    private String permission;
    private Long grantedBy;
    private String granterUsername;
    private LocalDateTime createdAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getFileId() { return fileId; }
    public void setFileId(Long fileId) { this.fileId = fileId; }
    public String getFileName() { return fileName; }
    public void setFileName(String fileName) { this.fileName = fileName; }
    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }
    public String getPermission() { return permission; }
    public void setPermission(String permission) { this.permission = permission; }
    public Long getGrantedBy() { return grantedBy; }
    public void setGrantedBy(Long grantedBy) { this.grantedBy = grantedBy; }
    public String getGranterUsername() { return granterUsername; }
    public void setGranterUsername(String granterUsername) { this.granterUsername = granterUsername; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
