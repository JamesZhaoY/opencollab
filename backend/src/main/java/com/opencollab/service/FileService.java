package com.opencollab.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.opencollab.dto.*;
import com.opencollab.entity.File;
import com.opencollab.entity.Permission;
import com.opencollab.entity.User;
import com.opencollab.exception.ResourceNotFoundException;
import com.opencollab.exception.UnauthorizedException;
import com.opencollab.mapper.FileMapper;
import com.opencollab.mapper.PermissionMapper;
import com.opencollab.mapper.UserMapper;
import org.apache.commons.codec.binary.Base64;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class FileService {

    private final FileMapper fileMapper;
    private final PermissionMapper permissionMapper;
    private final UserMapper userMapper;
    private final FileVersionService fileVersionService;
    private final CommentService commentService;
    private final ObjectMapper objectMapper;

    public FileService(FileMapper fileMapper,
                       PermissionMapper permissionMapper,
                       UserMapper userMapper,
                       FileVersionService fileVersionService,
                       @Lazy CommentService commentService,
                       ObjectMapper objectMapper) {
        this.fileMapper = fileMapper;
        this.permissionMapper = permissionMapper;
        this.userMapper = userMapper;
        this.fileVersionService = fileVersionService;
        this.commentService = commentService;
        this.objectMapper = objectMapper;
    }

    @Transactional(readOnly = true)
    public List<FileResponse> getOwnedFiles(Long userId) {
        List<File> files = fileMapper.selectList(
                new LambdaQueryWrapper<File>()
                        .eq(File::getOwnerId, userId)
                        .eq(File::getIsDeleted, false)
                        .orderByDesc(File::getUpdatedAt));
        return toFileResponses(files, userId);
    }

    @Transactional(readOnly = true)
    public List<FileResponse> getSharedFiles(Long userId) {
        List<Long> sharedIds = permissionMapper.selectList(
                new LambdaQueryWrapper<Permission>().eq(Permission::getUserId, userId))
                .stream().map(Permission::getFileId).collect(Collectors.toList());
        if (sharedIds.isEmpty()) {
            return Collections.emptyList();
        }
        List<File> files = fileMapper.selectBatchIds(sharedIds).stream()
                .filter(f -> f.getIsDeleted() == null || !f.getIsDeleted())
                .filter(f -> !f.getOwnerId().equals(userId))
                .collect(Collectors.toList());
        return toFileResponses(files, userId);
    }

    @Transactional(readOnly = true)
    public List<FileResponse> getTrashedFiles(Long userId) {
        List<File> files = fileMapper.selectList(
                new LambdaQueryWrapper<File>()
                        .eq(File::getOwnerId, userId)
                        .eq(File::getIsDeleted, true)
                        .orderByDesc(File::getUpdatedAt));
        return toFileResponses(files, userId);
    }

    @Transactional(readOnly = true)
    public FileResponse getFileById(Long fileId, Long userId) {
        File file = requireExisting(fileId);
        if (Boolean.TRUE.equals(file.getIsDeleted()) || !hasAccess(file, userId)) {
            throw new UnauthorizedException("您没有访问该文件的权限");
        }
        FileResponse response = toFileResponse(file, userId, loadUserMap(Collections.singletonList(file)));
        response.setSheetData(file.getSheetData());
        return response;
    }

    @Transactional
    public FileResponse createFile(String name, String description, Long ownerId) {
        File file = new File();
        file.setName(name);
        file.setDescription(description);
        file.setOwnerId(ownerId);
        file.setLastModifiedBy(ownerId);
        file.setIsDeleted(false);
        file.setDocumentType(File.inferDocumentType(name));
        fileMapper.insert(file);
        return toFileResponse(file, ownerId, loadUserMap(Collections.singletonList(file)));
    }

    @Transactional
    public FileResponse createFile(FileCreateRequest request, Long ownerId) {
        return createFile(request.getName(), request.getDescription(), ownerId);
    }

    @Transactional
    public FileResponse uploadFile(MultipartFile multipart, Long ownerId) throws IOException {
        String original = multipart.getOriginalFilename() != null ? multipart.getOriginalFilename() : "upload.bin";
        File file = new File();
        file.setName(original);
        file.setOwnerId(ownerId);
        file.setLastModifiedBy(ownerId);
        file.setIsDeleted(false);
        String type = File.inferDocumentType(original);
        file.setDocumentType(type);

        byte[] bytes = multipart.getBytes();
        if ("markdown".equals(type)) {
            String text = new String(bytes, StandardCharsets.UTF_8);
            file.setSheetData(text);
            file.setContent(text);
        } else if ("excel".equals(type)) {
            // Store empty placeholder; full POI parse is best-effort
            file.setSheetData("{}");
        } else if ("word".equals(type)) {
            // Frontend re-imports DOCX client-side; keep empty content
            file.setSheetData("[]");
        } else {
            file.setContent(Base64.encodeBase64String(bytes));
        }
        fileMapper.insert(file);
        return toFileResponse(file, ownerId, loadUserMap(Collections.singletonList(file)));
    }

    @Transactional
    public FileResponse updateFile(Long fileId, FileUpdateRequest request, Long userId) {
        File file = requireExisting(fileId);
        if (Boolean.TRUE.equals(file.getIsDeleted())) {
            throw new ResourceNotFoundException("文件不存在");
        }
        if (!hasWriteAccess(file, userId)) {
            throw new UnauthorizedException("您没有编辑该文件的权限");
        }
        if (request.getName() != null) {
            file.setName(request.getName());
            file.setDocumentType(File.inferDocumentType(request.getName()));
        }
        if (request.getDescription() != null) {
            file.setDescription(request.getDescription());
        }
        if (request.getContent() != null) {
            file.setYdocSnapshot(request.getContent());
        }
        if (request.getSheetData() != null) {
            file.setSheetData(request.getSheetData());
        }
        if (request.getYdocSnapshot() != null) {
            file.setYdocSnapshot(request.getYdocSnapshot());
        }
        file.setLastModifiedBy(userId);
        fileMapper.updateById(file);
        return toFileResponse(file, userId, loadUserMap(Collections.singletonList(file)));
    }

    @Transactional
    public FileResponse saveFileContent(Long fileId, FileSaveRequest request, Long userId) {
        File file = requireExisting(fileId);
        if (Boolean.TRUE.equals(file.getIsDeleted()) || !hasWriteAccess(file, userId)) {
            throw new UnauthorizedException("您没有编辑该文件的权限");
        }
        JsonNode sheets = request.getSheets();
        String serialized;
        if (sheets == null || sheets.isNull()) {
            serialized = null;
        } else if (sheets.isTextual()) {
            serialized = sheets.asText();
        } else {
            try {
                serialized = objectMapper.writeValueAsString(sheets);
            } catch (Exception e) {
                throw new IllegalArgumentException("文档内容格式不正确");
            }
        }
        // Frontend always re-reads sheet_data after save
        file.setSheetData(serialized);
        String type = file.getDocumentType();
        if ("markdown".equals(type) || "word".equals(type)) {
            file.setContent(serialized);
        }
        file.setLastModifiedBy(userId);
        fileMapper.updateById(file);
        fileVersionService.createSnapshot(file, userId, "手动保存");
        FileResponse response = toFileResponse(file, userId, loadUserMap(Collections.singletonList(file)));
        response.setSheetData(file.getSheetData());
        return response;
    }

    @Transactional
    public void syncYdoc(Long fileId, byte[] body, Long userId) {
        File file = requireExisting(fileId);
        if (Boolean.TRUE.equals(file.getIsDeleted()) || !hasWriteAccess(file, userId)) {
            throw new UnauthorizedException("您没有编辑该文件的权限");
        }
        file.setYdocSnapshot(Base64.encodeBase64String(body));
        file.setLastModifiedBy(userId);
        fileMapper.updateById(file);
    }

    @Transactional
    public void deleteFile(Long fileId, Long userId) {
        File file = requireExisting(fileId);
        if (!file.getOwnerId().equals(userId)) {
            throw new UnauthorizedException("只有文件所有者可以删除文件");
        }
        file.setIsDeleted(true);
        fileMapper.updateById(file);
    }

    @Transactional
    public FileResponse restoreFromTrash(Long fileId, Long userId) {
        File file = requireExisting(fileId);
        if (!file.getOwnerId().equals(userId)) {
            throw new UnauthorizedException("只有文件所有者可以恢复文件");
        }
        file.setIsDeleted(false);
        fileMapper.updateById(file);
        return toFileResponse(file, userId, loadUserMap(Collections.singletonList(file)));
    }

    @Transactional
    public void permanentDelete(Long fileId, Long userId) {
        File file = requireExisting(fileId);
        if (!file.getOwnerId().equals(userId)) {
            throw new UnauthorizedException("只有文件所有者可以永久删除文件");
        }
        permissionMapper.delete(new LambdaQueryWrapper<Permission>().eq(Permission::getFileId, fileId));
        fileVersionService.deleteByFileId(fileId);
        commentService.deleteByFileId(fileId);
        fileMapper.deleteById(fileId);
    }

    @Transactional(readOnly = true)
    public DownloadPayload download(Long fileId, Long userId) throws IOException {
        File file = requireExisting(fileId);
        if (Boolean.TRUE.equals(file.getIsDeleted()) || !hasAccess(file, userId)) {
            throw new UnauthorizedException("您没有访问该文件的权限");
        }
        String type = file.getDocumentType();
        String name = file.getName() != null ? file.getName() : "download";
        if ("excel".equals(type)) {
            byte[] bytes = buildMinimalXlsx(file.getSheetData());
            if (!name.toLowerCase().endsWith(".xlsx") && !name.toLowerCase().endsWith(".xls")) {
                name = name + ".xlsx";
            }
            return new DownloadPayload(bytes, name, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        }
        String text = file.getSheetData() != null ? file.getSheetData()
                : (file.getContent() != null ? file.getContent() : "");
        String contentType = "markdown".equals(type) ? "text/markdown; charset=utf-8"
                : ("word".equals(type) ? "application/json; charset=utf-8" : "text/plain; charset=utf-8");
        return new DownloadPayload(text.getBytes(StandardCharsets.UTF_8), name, contentType);
    }

    @Transactional(readOnly = true)
    public String getFileContent(Long fileId, Long userId) {
        File file = requireExisting(fileId);
        if (Boolean.TRUE.equals(file.getIsDeleted()) || !hasAccess(file, userId)) {
            throw new UnauthorizedException("您没有访问该文件的权限");
        }
        if ("excel".equals(file.getDocumentType())) {
            return file.getSheetData();
        }
        return file.getSheetData() != null ? file.getSheetData() : file.getYdocSnapshot();
    }

    @Transactional(readOnly = true)
    public File getFileEntityById(Long fileId, Long userId) {
        File file = requireExisting(fileId);
        if (Boolean.TRUE.equals(file.getIsDeleted()) || !hasAccess(file, userId)) {
            throw new UnauthorizedException("您没有访问该文件的权限");
        }
        return file;
    }

    @Transactional
    public void saveFileEntity(File file, Long userId) {
        if (!hasWriteAccess(file, userId)) {
            throw new UnauthorizedException("您没有编辑该文件的权限");
        }
        file.setLastModifiedBy(userId);
        fileMapper.updateById(file);
    }

    public boolean hasAccess(File file, Long userId) {
        if (file.getOwnerId().equals(userId)) {
            return true;
        }
        Long count = permissionMapper.selectCount(
                new LambdaQueryWrapper<Permission>()
                        .eq(Permission::getFileId, file.getId())
                        .eq(Permission::getUserId, userId));
        return count != null && count > 0;
    }

    public boolean hasWriteAccess(File file, Long userId) {
        if (file.getOwnerId().equals(userId)) {
            return true;
        }
        Permission permission = permissionMapper.selectOne(
                new LambdaQueryWrapper<Permission>()
                        .eq(Permission::getFileId, file.getId())
                        .eq(Permission::getUserId, userId));
        return permission != null
                && ("edit".equals(permission.getPermission()) || "owner".equals(permission.getPermission()));
    }

    public String resolvePermission(File file, Long userId) {
        if (file.getOwnerId().equals(userId)) {
            return "owner";
        }
        Permission permission = permissionMapper.selectOne(
                new LambdaQueryWrapper<Permission>()
                        .eq(Permission::getFileId, file.getId())
                        .eq(Permission::getUserId, userId));
        return permission != null ? permission.getPermission() : null;
    }

    private File requireExisting(Long fileId) {
        File file = fileMapper.selectById(fileId);
        if (file == null) {
            throw new ResourceNotFoundException("文件不存在");
        }
        return file;
    }

    private List<FileResponse> toFileResponses(List<File> files, Long viewerId) {
        Map<Long, User> users = loadUserMap(files);
        return files.stream().map(f -> toFileResponse(f, viewerId, users)).collect(Collectors.toList());
    }

    private FileResponse toFileResponse(File file, Long viewerId, Map<Long, User> users) {
        FileResponse response = new FileResponse();
        response.setId(file.getId());
        response.setName(file.getName());
        response.setDescription(file.getDescription());
        response.setOwnerId(file.getOwnerId());
        response.setDocumentType(file.getDocumentType());
        response.setLastModifiedBy(file.getLastModifiedBy());
        response.setCreatedAt(file.getCreatedAt());
        response.setUpdatedAt(file.getUpdatedAt());
        response.setIsDeleted(file.getIsDeleted());
        response.setCurrentPermission(resolvePermission(file, viewerId));

        User owner = users.get(file.getOwnerId());
        if (owner != null) {
            response.setOwnerUsername(owner.getUsername());
        }
        if (file.getLastModifiedBy() != null) {
            User modifier = users.get(file.getLastModifiedBy());
            if (modifier != null) {
                response.setLastModifierUsername(modifier.getUsername());
            }
        }
        return response;
    }

    private Map<Long, User> loadUserMap(List<File> files) {
        Set<Long> ids = new HashSet<>();
        for (File f : files) {
            if (f.getOwnerId() != null) ids.add(f.getOwnerId());
            if (f.getLastModifiedBy() != null) ids.add(f.getLastModifiedBy());
        }
        if (ids.isEmpty()) {
            return Collections.emptyMap();
        }
        return userMapper.selectBatchIds(ids).stream()
                .collect(Collectors.toMap(User::getId, u -> u, (a, b) -> a));
    }

    private byte[] buildMinimalXlsx(String sheetDataJson) throws IOException {
        try (Workbook workbook = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sheet = workbook.createSheet("Sheet1");
            if (sheetDataJson != null && !sheetDataJson.isEmpty() && !sheetDataJson.equals("{}")) {
                try {
                    JsonNode root = objectMapper.readTree(sheetDataJson);
                    // Best-effort: if it's a simple 2d array
                    if (root.isArray()) {
                        int r = 0;
                        for (JsonNode rowNode : root) {
                            Row row = sheet.createRow(r++);
                            int c = 0;
                            if (rowNode.isArray()) {
                                for (JsonNode cellNode : rowNode) {
                                    Cell cell = row.createCell(c++);
                                    if (cellNode.isNumber()) {
                                        cell.setCellValue(cellNode.asDouble());
                                    } else {
                                        cell.setCellValue(cellNode.asText(""));
                                    }
                                }
                            }
                        }
                    }
                } catch (Exception ignored) {
                    Row row = sheet.createRow(0);
                    row.createCell(0).setCellValue(sheetDataJson);
                }
            }
            workbook.write(out);
            return out.toByteArray();
        }
    }

    public static class DownloadPayload {
        public final byte[] bytes;
        public final String filename;
        public final String contentType;

        public DownloadPayload(byte[] bytes, String filename, String contentType) {
            this.bytes = bytes;
            this.filename = filename;
            this.contentType = contentType;
        }
    }
}
