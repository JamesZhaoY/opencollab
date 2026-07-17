package com.opencollab.dto;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.Data;

@Data
public class FileSaveRequest {
    /** Overloaded: object for excel, string for markdown/word. */
    private JsonNode sheets;

    /** Automatic saves update the current file only; users explicitly opt into a history checkpoint. */
    private Boolean createVersion = false;

    public JsonNode getSheets() { return sheets; }
    public void setSheets(JsonNode sheets) { this.sheets = sheets; }
    public Boolean getCreateVersion() { return createVersion; }
    public void setCreateVersion(Boolean createVersion) { this.createVersion = createVersion; }
}
