package com.opencollab.controller;

import com.opencollab.dto.FileVersionResponse;
import com.opencollab.dto.Result;
import com.opencollab.entity.File;
import com.opencollab.entity.FileVersion;
import com.opencollab.security.CustomUserDetailsService;
import com.opencollab.service.FileService;
import com.opencollab.service.FileVersionService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/files/{fileId}/versions")
public class FileVersionController {

    private final FileVersionService fileVersionService;
    private final FileService fileService;
    private final CustomUserDetailsService userDetailsService;

    public FileVersionController(FileVersionService fileVersionService,
                                 FileService fileService,
                                 CustomUserDetailsService userDetailsService) {
        this.fileVersionService = fileVersionService;
        this.fileService = fileService;
        this.userDetailsService = userDetailsService;
    }

    @GetMapping
    public Result<List<FileVersionResponse>> getVersions(@PathVariable Long fileId,
                                                         @AuthenticationPrincipal UserDetails userDetails) {
        Long userId = userDetailsService.getUserIdFromDetails(userDetails);
        // read access
        fileService.getFileEntityById(fileId, userId);
        List<FileVersionResponse> responses = fileVersionService.getVersions(fileId).stream()
                .map(this::toResponse)
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
            throw new com.opencollab.exception.UnauthorizedException("You don't have permission to edit this file");
        }
        fileVersionService.restoreVersion(file, versionId, userId);
        fileService.saveFileEntity(file, userId);
        return Result.success();
    }

    private FileVersionResponse toResponse(FileVersion version) {
        FileVersionResponse response = new FileVersionResponse();
        response.setId(version.getId());
        response.setFileId(version.getFileId());
        response.setVersion(version.getVersion());
        response.setCreatedBy(version.getCreatedBy());
        response.setCreatedAt(version.getCreatedAt());
        response.setRemark(version.getRemark());
        return response;
    }
}
