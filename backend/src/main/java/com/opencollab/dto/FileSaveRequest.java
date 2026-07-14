package com.opencollab.dto;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.Data;

@Data
public class FileSaveRequest {
    /** Overloaded: object for excel, string for markdown/word. */
    private JsonNode sheets;

    public JsonNode getSheets() { return sheets; }
    public void setSheets(JsonNode sheets) { this.sheets = sheets; }
}
