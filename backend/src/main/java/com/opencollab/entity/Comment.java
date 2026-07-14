package com.opencollab.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@TableName("comments")
@NoArgsConstructor
@AllArgsConstructor
public class Comment {

    @TableId(type = IdType.AUTO)
    private Long id;

    @TableField("file_id")
    private Long fileId;

    @TableField("user_id")
    private Long userId;

    @TableField("cell_ref")
    private String cellRef;

    @TableField("content")
    private String content;

    @TableField("is_resolved")
    private Boolean isResolved = false;

    @TableField(value = "created_at", fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(value = "updated_at", fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getFileId() { return fileId; }
    public void setFileId(Long fileId) { this.fileId = fileId; }
    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
    public String getCellRef() { return cellRef; }
    public void setCellRef(String cellRef) { this.cellRef = cellRef; }
    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
    public Boolean getIsResolved() { return isResolved; }
    public void setIsResolved(Boolean isResolved) { this.isResolved = isResolved; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
