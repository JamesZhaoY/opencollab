package com.opencollab.dto;

import lombok.Data;

import javax.validation.constraints.NotBlank;

@Data
public class FileCreateRequest {
    @NotBlank(message = "File name is required")
    private String name;
    private String description;
    private String content;
    private String documentType;

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
    public String getDocumentType() { return documentType; }
    public void setDocumentType(String documentType) { this.documentType = documentType; }
}