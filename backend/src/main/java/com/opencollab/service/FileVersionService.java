package com.opencollab.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.opencollab.entity.File;
import com.opencollab.entity.FileVersion;
import com.opencollab.exception.ResourceNotFoundException;
import com.opencollab.mapper.FileVersionMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Service
public class FileVersionService {

    private final FileVersionMapper fileVersionMapper;

    public FileVersionService(FileVersionMapper fileVersionMapper) {
        this.fileVersionMapper = fileVersionMapper;
    }

    @Transactional(readOnly = true)
    public List<FileVersion> getVersions(Long fileId) {
        return fileVersionMapper.selectList(
                new LambdaQueryWrapper<FileVersion>()
                        .eq(FileVersion::getFileId, fileId)
                        .orderByDesc(FileVersion::getVersion));
    }

    @Transactional(readOnly = true)
    public FileVersion getVersion(Long versionId) {
        FileVersion version = fileVersionMapper.selectById(versionId);
        if (version == null) {
            throw new ResourceNotFoundException("历史版本不存在");
        }
        return version;
    }

    @Transactional
    public FileVersion createSnapshot(File file, Long userId, String remark) {
        Integer max = fileVersionMapper.selectList(
                new LambdaQueryWrapper<FileVersion>()
                        .eq(FileVersion::getFileId, file.getId())
                        .orderByDesc(FileVersion::getVersion)
                        .last("LIMIT 1"))
                .stream()
                .findFirst()
                .map(FileVersion::getVersion)
                .orElse(0);

        FileVersion version = new FileVersion();
        version.setFileId(file.getId());
        version.setVersion(max + 1);
        version.setYdocSnapshot(file.getYdocSnapshot());
        version.setSheetData(file.getSheetData());
        version.setContent(file.getContent());
        version.setCreatedBy(userId);
        version.setCreatedAt(LocalDateTime.now());
        version.setRemark(remark);
        fileVersionMapper.insert(version);
        return version;
    }

    /**
     * Apply a historical version onto the given file entity (caller must persist).
     */
    @Transactional
    public void restoreVersion(File file, Long versionId, Long userId) {
        FileVersion version = getVersion(versionId);
        if (!version.getFileId().equals(file.getId())) {
            throw new ResourceNotFoundException("该历史版本不属于当前文件");
        }
        // 当前状态尚未存在于任何历史快照时，才需要在回滚前额外备份。
        if (!isCurrentStateVersioned(file)) {
            createSnapshot(file, userId, "回滚前自动备份（V" + version.getVersion() + "）");
        }
        file.setYdocSnapshot(version.getYdocSnapshot());
        file.setSheetData(version.getSheetData());
        file.setContent(version.getContent());
    }

    private boolean isCurrentStateVersioned(File file) {
        LambdaQueryWrapper<FileVersion> query = new LambdaQueryWrapper<FileVersion>()
                .eq(FileVersion::getFileId, file.getId());
        if (file.getYdocSnapshot() == null) {
            query.isNull(FileVersion::getYdocSnapshot);
        } else {
            query.eq(FileVersion::getYdocSnapshot, file.getYdocSnapshot());
        }
        if (file.getSheetData() == null) {
            query.isNull(FileVersion::getSheetData);
        } else {
            query.eq(FileVersion::getSheetData, file.getSheetData());
        }
        if (file.getContent() == null) {
            query.isNull(FileVersion::getContent);
        } else {
            query.eq(FileVersion::getContent, file.getContent());
        }
        Long count = fileVersionMapper.selectCount(query);
        return count != null && count > 0;
    }

    public void deleteByFileId(Long fileId) {
        fileVersionMapper.delete(new LambdaQueryWrapper<FileVersion>().eq(FileVersion::getFileId, fileId));
    }
}
