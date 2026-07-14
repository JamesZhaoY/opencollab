package com.opencollab.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class FileResponse {
    private Long id;
    private String name;
    private String description;
    private Long ownerId;
    private String ownerUsername;
    private String documentType;
    private Long lastModifiedBy;
    private String lastModifierUsername;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private Boolean isDeleted;
    private String sheetData;
    private String currentPermission;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public Long getOwnerId() { return ownerId; }
    public void setOwnerId(Long ownerId) { this.ownerId = ownerId; }
    public String getOwnerUsername() { return ownerUsername; }
    public void setOwnerUsername(String ownerUsername) { this.ownerUsername = ownerUsername; }
    public String getDocumentType() { return documentType; }
    public void setDocumentType(String documentType) { this.documentType = documentType; }
    public Long getLastModifiedBy() { return lastModifiedBy; }
    public void setLastModifiedBy(Long lastModifiedBy) { this.lastModifiedBy = lastModifiedBy; }
    public String getLastModifierUsername() { return lastModifierUsername; }
    public void setLastModifierUsername(String lastModifierUsername) { this.lastModifierUsername = lastModifierUsername; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
    public Boolean getIsDeleted() { return isDeleted; }
    public void setIsDeleted(Boolean isDeleted) { this.isDeleted = isDeleted; }
    public String getSheetData() { return sheetData; }
    public void setSheetData(String sheetData) { this.sheetData = sheetData; }
    public String getCurrentPermission() { return currentPermission; }
    public void setCurrentPermission(String currentPermission) { this.currentPermission = currentPermission; }
}
