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
            throw new ResourceNotFoundException("Version not found");
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
            throw new ResourceNotFoundException("Version does not belong to this file");
        }
        // Snapshot current state before restore
        createSnapshot(file, userId, "auto before restore to v" + version.getVersion());
        file.setYdocSnapshot(version.getYdocSnapshot());
        file.setSheetData(version.getSheetData());
        file.setContent(version.getContent());
    }

    public void deleteByFileId(Long fileId) {
        fileVersionMapper.delete(new LambdaQueryWrapper<FileVersion>().eq(FileVersion::getFileId, fileId));
    }
}
