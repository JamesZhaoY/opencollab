package com.opencollab.service;

import com.opencollab.dto.FileSaveRequest;
import com.opencollab.entity.File;
import com.opencollab.mapper.FileMapper;
import com.opencollab.mapper.PermissionMapper;
import com.opencollab.mapper.UserMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Collections;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class FileServiceSaveTest {

    @Mock private FileMapper fileMapper;
    @Mock private PermissionMapper permissionMapper;
    @Mock private UserMapper userMapper;
    @Mock private FileVersionService fileVersionService;
    @Mock private CommentService commentService;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private FileService service;

    @BeforeEach
    void setUp() {
        service = new FileService(
                fileMapper, permissionMapper, userMapper, fileVersionService, commentService, objectMapper);
        when(userMapper.selectBatchIds(anyCollection())).thenReturn(Collections.emptyList());
    }

    @Test
    void automaticSaveUpdatesCurrentContentWithoutCreatingHistorySnapshot() throws Exception {
        File file = editableMarkdownFile();
        FileSaveRequest request = saveRequest(false);
        when(fileMapper.selectById(1L)).thenReturn(file);

        service.saveFileContent(1L, request, 7L);

        assertEquals("# 最新内容", file.getSheetData());
        assertEquals("# 最新内容", file.getContent());
        assertNull(file.getYdocSnapshot());
        verify(fileMapper).updateById(file);
        verify(fileVersionService, never()).createSnapshot(file, 7L, "手动保存");
    }

    @Test
    void explicitCheckpointCreatesOneHistorySnapshot() throws Exception {
        File file = editableMarkdownFile();
        FileSaveRequest request = saveRequest(true);
        when(fileMapper.selectById(1L)).thenReturn(file);

        service.saveFileContent(1L, request, 7L);

        verify(fileVersionService).createSnapshot(eq(file), eq(7L), eq("手动保存"));
    }

    private File editableMarkdownFile() {
        File file = new File();
        file.setId(1L);
        file.setOwnerId(7L);
        file.setName("说明.md");
        file.setDocumentType("markdown");
        file.setYdocSnapshot("过时的完整 Yjs 状态");
        return file;
    }

    private FileSaveRequest saveRequest(boolean createVersion) throws Exception {
        FileSaveRequest request = new FileSaveRequest();
        request.setSheets(objectMapper.readTree("\"# 最新内容\""));
        request.setCreateVersion(createVersion);
        return request;
    }
}
