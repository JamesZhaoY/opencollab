package com.opencollab.controller;

import com.opencollab.dto.FileVersionResponse;
import com.opencollab.dto.Result;
import com.opencollab.entity.File;
import com.opencollab.entity.FileVersion;
import com.opencollab.entity.User;
import com.opencollab.mapper.UserMapper;
import com.opencollab.security.CustomUserDetailsService;
import com.opencollab.service.FileService;
import com.opencollab.service.FileVersionService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.Collections;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/files/{fileId}/versions")
public class FileVersionController {

    private final FileVersionService fileVersionService;
    private final FileService fileService;
    private final CustomUserDetailsService userDetailsService;
    private final UserMapper userMapper;

    public FileVersionController(FileVersionService fileVersionService,
                                 FileService fileService,
                                 CustomUserDetailsService userDetailsService,
                                 UserMapper userMapper) {
        this.fileVersionService = fileVersionService;
        this.fileService = fileService;
        this.userDetailsService = userDetailsService;
        this.userMapper = userMapper;
    }

    @GetMapping
    public Result<List<FileVersionResponse>> getVersions(@PathVariable Long fileId,
                                                         @AuthenticationPrincipal UserDetails userDetails) {
        Long userId = userDetailsService.getUserIdFromDetails(userDetails);
        // read access
        fileService.getFileEntityById(fileId, userId);
        List<FileVersion> versions = fileVersionService.getVersions(fileId);
        Map<Long, String> creatorNames = loadCreatorNames(versions);
        List<FileVersionResponse> responses = versions.stream()
                .map(version -> toResponse(version, creatorNames))
                .collect(Collectors.toList());
        return Result.success(responses);
    }

    @PostMapping("/{versionId}/restore")
    public Result<Void> restoreVersion(@PathVariable Long fileId,
                                       @PathVariable Long versionId,
                                       @AuthenticationPrincipal UserDetails userDetails) {
        Long userId = userDetailsService.getUserIdFromDetails(userDetails);
        File file = fileService.getFileEntityById(fileId, userId);
        if (!fileService.hasWriteAccess(file, userId)) {
            throw new com.opencollab.exception.UnauthorizedException("您没有编辑该文件的权限");
        }
        fileVersionService.restoreVersion(file, versionId, userId);
        fileService.saveFileEntity(file, userId);
        return Result.success();
    }

    private FileVersionResponse toResponse(FileVersion version, Map<Long, String> creatorNames) {
        FileVersionResponse response = new FileVersionResponse();
        response.setId(version.getId());
        response.setFileId(version.getFileId());
        response.setVersion(version.getVersion());
        response.setCreatedBy(version.getCreatedBy());
        response.setCreatedByName(creatorNames.get(version.getCreatedBy()));
        response.setCreatedAt(version.getCreatedAt());
        response.setRemark(version.getRemark());
        return response;
    }

    private Map<Long, String> loadCreatorNames(List<FileVersion> versions) {
        Set<Long> creatorIds = versions.stream()
                .map(FileVersion::getCreatedBy)
                .filter(java.util.Objects::nonNull)
                .collect(Collectors.toSet());
        if (creatorIds.isEmpty()) {
            return Collections.emptyMap();
        }
        return userMapper.selectBatchIds(creatorIds).stream()
                .collect(Collectors.toMap(User::getId, User::getUsername, (first, ignored) -> first));
    }
}
