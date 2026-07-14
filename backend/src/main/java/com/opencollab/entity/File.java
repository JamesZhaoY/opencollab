package com.opencollab.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@TableName("files")
@NoArgsConstructor
@AllArgsConstructor
public class File {

    @TableId(type = IdType.AUTO)
    private Long id;

    @TableField("name")
    private String name;

    @TableField("description")
    private String description;

    @TableField("owner_id")
    private Long ownerId;

    @TableField("document_type")
    private String documentType;

    @TableField("ydoc_snapshot")
    private String ydocSnapshot;

    @TableField("sheet_data")
    private String sheetData;

    @TableField("content")
    private String content;

    @TableField("last_modified_by")
    private Long lastModifiedBy;

    @TableField(value = "created_at", fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(value = "updated_at", fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableField("is_deleted")
    private Boolean isDeleted = false;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public Long getOwnerId() { return ownerId; }
    public void setOwnerId(Long ownerId) { this.ownerId = ownerId; }
    public void setDocumentType(String documentType) { this.documentType = documentType; }
    public String getYdocSnapshot() { return ydocSnapshot; }
    public void setYdocSnapshot(String ydocSnapshot) { this.ydocSnapshot = ydocSnapshot; }
    public String getSheetData() { return sheetData; }
    public void setSheetData(String sheetData) { this.sheetData = sheetData; }
    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
    public Long getLastModifiedBy() { return lastModifiedBy; }
    public void setLastModifiedBy(Long lastModifiedBy) { this.lastModifiedBy = lastModifiedBy; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
    public Boolean getIsDeleted() { return isDeleted; }
    public void setIsDeleted(Boolean isDeleted) { this.isDeleted = isDeleted; }

    /** Prefer stored column; fall back to extension inference. */
    public String getDocumentType() {
        if (documentType != null && !documentType.isEmpty()) {
            return documentType;
        }
        return inferDocumentType(name);
    }

    public static String inferDocumentType(String name) {
        if (name == null) return "unknown";
        String lower = name.toLowerCase();
        if (lower.endsWith(".xlsx") || lower.endsWith(".xls") || lower.endsWith(".csv")) {
            return "excel";
        } else if (lower.endsWith(".docx") || lower.endsWith(".doc")) {
            return "word";
        } else if (lower.endsWith(".md") || lower.endsWith(".markdown") || lower.endsWith(".txt")) {
            return "markdown";
        }
        return "unknown";
    }
}
