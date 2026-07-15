package com.opencollab.service;

import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.opencollab.entity.File;
import com.opencollab.entity.FileVersion;
import com.opencollab.mapper.FileVersionMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Collections;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class FileVersionServiceTest {

    @Mock
    private FileVersionMapper fileVersionMapper;

    private FileVersionService service;

    @BeforeEach
    void setUp() {
        service = new FileVersionService(fileVersionMapper);
    }

    @Test
    void restoreDoesNotCreateBackupWhenCurrentStateAlreadyHasSnapshot() {
        File file = currentFile();
        FileVersion target = targetVersion();
        when(fileVersionMapper.selectById(2L)).thenReturn(target);
        when(fileVersionMapper.selectCount(any(Wrapper.class))).thenReturn(1L);

        service.restoreVersion(file, 2L, 9L);

        verify(fileVersionMapper, never()).insert(any(FileVersion.class));
        assertEquals("目标协同快照", file.getYdocSnapshot());
        assertEquals("目标表格数据", file.getSheetData());
        assertEquals("目标正文", file.getContent());
    }

    @Test
    void restoreCreatesBackupWhenCurrentStateHasNotBeenVersioned() {
        File file = currentFile();
        FileVersion target = targetVersion();
        FileVersion latest = new FileVersion();
        latest.setVersion(4);
        when(fileVersionMapper.selectById(2L)).thenReturn(target);
        when(fileVersionMapper.selectCount(any(Wrapper.class))).thenReturn(0L);
        when(fileVersionMapper.selectList(any(Wrapper.class))).thenReturn(Collections.singletonList(latest));

        service.restoreVersion(file, 2L, 9L);

        ArgumentCaptor<FileVersion> captor = ArgumentCaptor.forClass(FileVersion.class);
        verify(fileVersionMapper).insert(captor.capture());
        assertEquals(5, captor.getValue().getVersion());
        assertEquals("当前正文", captor.getValue().getContent());
        assertEquals("回滚前自动备份（V2）", captor.getValue().getRemark());
    }

    private File currentFile() {
        File file = new File();
        file.setId(1L);
        file.setYdocSnapshot("当前协同快照");
        file.setSheetData("当前表格数据");
        file.setContent("当前正文");
        return file;
    }

    private FileVersion targetVersion() {
        FileVersion version = new FileVersion();
        version.setId(2L);
        version.setFileId(1L);
        version.setVersion(2);
        version.setYdocSnapshot("目标协同快照");
        version.setSheetData("目标表格数据");
        version.setContent("目标正文");
        return version;
    }
}
