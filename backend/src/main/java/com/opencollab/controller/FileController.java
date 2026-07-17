package com.opencollab.controller;

import com.opencollab.dto.*;
import com.opencollab.entity.User;
import com.opencollab.security.CustomUserDetailsService;
import com.opencollab.service.CommentService;
import com.opencollab.service.ExcelLockService;
import com.opencollab.service.FileService;
import com.opencollab.service.PermissionService;
import com.opencollab.service.UserService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import javax.validation.Valid;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;

@RestController
@RequestMapping("/api/files")
public class FileController {

    private final FileService fileService;
    private final CustomUserDetailsService userDetailsService;
    private final CommentService commentService;
    private final PermissionService permissionService;
    private final UserService userService;
    private final ExcelLockService excelLockService;

    public FileController(FileService fileService,
                          CustomUserDetailsService userDetailsService,
                          CommentService commentService,
                          PermissionService permissionService,
                          UserService userService,
                          ExcelLockService excelLockService) {
        this.fileService = fileService;
        this.userDetailsService = userDetailsService;
        this.commentService = commentService;
        this.permissionService = permissionService;
        this.userService = userService;
        this.excelLockService = excelLockService;
    }

    private User currentUser(UserDetails userDetails) {
        return userDetailsService.getUserByUsername(userDetails.getUsername());
    }

    // ---------- lists ----------

    @GetMapping
    public Result<List<FileResponse>> getOwnedFiles(@AuthenticationPrincipal UserDetails userDetails) {
        return Result.success(fileService.getOwnedFiles(currentUser(userDetails).getId()));
    }

    @GetMapping("/shared")
    public Result<List<FileResponse>> getSharedFiles(@AuthenticationPrincipal UserDetails userDetails) {
        return Result.success(fileService.getSharedFiles(currentUser(userDetails).getId()));
    }

    @GetMapping("/trashed")
    public Result<List<FileResponse>> getTrashedFiles(@AuthenticationPrincipal UserDetails userDetails) {
        return Result.success(fileService.getTrashedFiles(currentUser(userDetails).getId()));
    }

    @GetMapping("/users/search")
    public Result<List<UserResponse>> searchUsers(@RequestParam("q") String q,
                                                  @AuthenticationPrincipal UserDetails userDetails) {
        return Result.success(userService.searchUsers(q));
    }

    // ---------- CRUD ----------

    @GetMapping("/{id}")
    public Result<FileResponse> getFileById(@PathVariable Long id,
                                            @AuthenticationPrincipal UserDetails userDetails) {
        return Result.success(fileService.getFileById(id, currentUser(userDetails).getId()));
    }

    @GetMapping("/{id}/content")
    public Result<String> getFileContent(@PathVariable Long id,
                                         @AuthenticationPrincipal UserDetails userDetails) {
        return Result.success(fileService.getFileContent(id, currentUser(userDetails).getId()));
    }

    /**
     * Create empty file. Frontend sends query params name/description with null body.
     */
    @PostMapping
    public Result<FileResponse> createFile(@RequestParam(value = "name", required = false) String name,
                                           @RequestParam(value = "description", required = false) String description,
                                           @RequestBody(required = false) FileCreateRequest body,
                                           @AuthenticationPrincipal UserDetails userDetails) {
        Long userId = currentUser(userDetails).getId();
        if (body != null && body.getName() != null) {
            return Result.success(fileService.createFile(body, userId));
        }
        if (name == null || name.trim().isEmpty()) {
            throw new IllegalArgumentException("文件名不能为空");
        }
        return Result.success(fileService.createFile(name, description, userId));
    }

    @PostMapping("/upload")
    public Result<FileResponse> upload(@RequestParam("file") MultipartFile file,
                                       @AuthenticationPrincipal UserDetails userDetails) throws Exception {
        return Result.success(fileService.uploadFile(file, currentUser(userDetails).getId()));
    }

    @PutMapping("/{id}")
    public Result<FileResponse> updateFile(@PathVariable Long id,
                                           @RequestBody FileUpdateRequest request,
                                           @AuthenticationPrincipal UserDetails userDetails) {
        return Result.success(fileService.updateFile(id, request, currentUser(userDetails).getId()));
    }

    @PostMapping("/{id}/save")
    public Result<FileResponse> saveFile(@PathVariable Long id,
                                         @RequestBody FileSaveRequest request,
                                         @AuthenticationPrincipal UserDetails userDetails) {
        return Result.success(fileService.saveFileContent(id, request, currentUser(userDetails).getId()));
    }

    @DeleteMapping("/{id}")
    public Result<Void> deleteFile(@PathVariable Long id,
                                   @AuthenticationPrincipal UserDetails userDetails) {
        fileService.deleteFile(id, currentUser(userDetails).getId());
        return Result.success();
    }

    @PostMapping("/{id}/restore")
    public Result<FileResponse> restoreFile(@PathVariable Long id,
                                            @AuthenticationPrincipal UserDetails userDetails) {
        return Result.success(fileService.restoreFromTrash(id, currentUser(userDetails).getId()));
    }

    @DeleteMapping("/{id}/permanent")
    public Result<Void> permanentDelete(@PathVariable Long id,
                                        @AuthenticationPrincipal UserDetails userDetails) {
        fileService.permanentDelete(id, currentUser(userDetails).getId());
        return Result.success();
    }

    @GetMapping("/{id}/download")
    public ResponseEntity<byte[]> download(@PathVariable Long id,
                                           @AuthenticationPrincipal UserDetails userDetails) throws Exception {
        FileService.DownloadPayload payload = fileService.download(id, currentUser(userDetails).getId());
        String encoded = URLEncoder.encode(payload.filename, StandardCharsets.UTF_8.name()).replace("+", "%20");
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename*=UTF-8''" + encoded)
                .contentType(MediaType.parseMediaType(payload.contentType))
                .body(payload.bytes);
    }

    @GetMapping("/{id}/download-name")
    public Result<String> getDownloadFilename(@PathVariable Long id,
                                              @AuthenticationPrincipal UserDetails userDetails) {
        return Result.success(fileService.getDownloadFilename(id, currentUser(userDetails).getId()));
    }

    @PostMapping("/{id}/excel-locks")
    public Result<ExcelLockResponse> acquireExcelLock(@PathVariable Long id,
                                                       @Valid @RequestBody ExcelLockRequest request,
                                                       @AuthenticationPrincipal UserDetails userDetails) {
        User user = currentUser(userDetails);
        if (!fileService.hasWriteAccess(fileService.getFileEntityById(id, user.getId()), user.getId())) {
            throw new com.opencollab.exception.UnauthorizedException("您没有编辑该文件的权限");
        }
        return Result.success(excelLockService.acquire(id, request.getSheetId(), request.getRow(), request.getColumn(), user));
    }

    @PostMapping("/{id}/excel-locks/release")
    public Result<Void> releaseExcelLock(@PathVariable Long id,
                                         @Valid @RequestBody ExcelLockRequest request,
                                         @AuthenticationPrincipal UserDetails userDetails) {
        User user = currentUser(userDetails);
        if (!fileService.hasWriteAccess(fileService.getFileEntityById(id, user.getId()), user.getId())) {
            throw new com.opencollab.exception.UnauthorizedException("您没有编辑该文件的权限");
        }
        excelLockService.release(id, request.getSheetId(), request.getRow(), request.getColumn(), user);
        return Result.success();
    }

    // ---------- comments ----------

    @GetMapping("/{id}/comments")
    public Result<List<CommentResponse>> listComments(@PathVariable Long id,
                                                      @AuthenticationPrincipal UserDetails userDetails) {
        return Result.success(commentService.listComments(id, currentUser(userDetails).getId()));
    }

    @PostMapping("/{id}/comments")
    public Result<CommentResponse> createComment(@PathVariable Long id,
                                                 @Valid @RequestBody CommentCreateRequest request,
                                                 @AuthenticationPrincipal UserDetails userDetails) {
        return Result.success(commentService.createComment(id, request, currentUser(userDetails).getId()));
    }

    // ---------- permissions (frontend paths) ----------

    @GetMapping("/{id}/permissions")
    public Result<List<PermissionResponse>> listPermissions(@PathVariable Long id,
                                                            @AuthenticationPrincipal UserDetails userDetails) {
        return Result.success(permissionService.getPermissionsForFile(id, currentUser(userDetails).getId()));
    }

    @PostMapping("/{id}/permissions")
    public Result<PermissionResponse> grantPermission(@PathVariable Long id,
                                                      @Valid @RequestBody GrantFilePermissionRequest request,
                                                      @AuthenticationPrincipal UserDetails userDetails) {
        GrantPermissionRequest full = new GrantPermissionRequest();
        full.setFileId(id);
        full.setUserId(request.getUserId());
        full.setPermission(request.getPermission());
        return Result.success(permissionService.grantPermission(full, currentUser(userDetails).getId()));
    }

    @PostMapping("/{id}/permissions/revoke")
    public Result<Void> revokePermission(@PathVariable Long id,
                                         @Valid @RequestBody RevokePermissionRequest request,
                                         @AuthenticationPrincipal UserDetails userDetails) {
        permissionService.revokePermission(id, request.getUserId(), currentUser(userDetails).getId());
        return Result.success();
    }
}
