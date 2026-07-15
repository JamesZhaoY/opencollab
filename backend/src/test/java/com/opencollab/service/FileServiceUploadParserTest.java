package com.opencollab.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

class FileServiceUploadParserTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final FileService fileService = new FileService(null, null, null, null, null, objectMapper);

    @Test
    void importsCsvIntoNonEmptySpreadsheetSnapshot() throws Exception {
        Method method = FileService.class.getDeclaredMethod("importSpreadsheet", byte[].class, String.class);
        method.setAccessible(true);

        String snapshot = (String) method.invoke(
                fileService,
                "姓名,部门\n张三,产品\n".getBytes(StandardCharsets.UTF_8),
                "成员.csv"
        );

        JsonNode sheets = objectMapper.readTree(snapshot);
        assertEquals("Sheet1", sheets.get(0).get("name").asText());
        assertFalse(sheets.get(0).get("celldata").isEmpty());
        assertEquals("姓名", sheets.get(0).get("celldata").get(0).get("v").asText());
    }
}
