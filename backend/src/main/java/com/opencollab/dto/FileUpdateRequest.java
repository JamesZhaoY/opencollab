package com.opencollab.dto;

import lombok.Data;

@Data
public class FileUpdateRequest {
    private String name;
    private String description;
    private String content;
    private String ydocSnapshot;
    private String sheetData;

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
    public String getYdocSnapshot() { return ydocSnapshot; }
    public void setYdocSnapshot(String ydocSnapshot) { this.ydocSnapshot = ydocSnapshot; }
    public String getSheetData() { return sheetData; }
    public void setSheetData(String sheetData) { this.sheetData = sheetData; }
}
