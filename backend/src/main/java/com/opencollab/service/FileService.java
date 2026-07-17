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
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
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
            file.setSheetData(importSpreadsheet(bytes, original));
        } else if ("word".equals(type)) {
            String text = extractWordText(bytes);
            file.setSheetData(text);
            file.setContent(text);
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
        // The relay server cannot restore Yjs snapshots. Keeping a full CRDT state
        // beside the canonical document duplicates data and grows with each edit.
        file.setYdocSnapshot(null);
        file.setLastModifiedBy(userId);
        fileMapper.updateById(file);
        if (Boolean.TRUE.equals(request.getCreateVersion())) {
            fileVersionService.createSnapshot(file, userId, "手动保存");
        }
        FileResponse response = toFileResponse(file, userId, loadUserMap(Collections.singletonList(file)));
        response.setSheetData(file.getSheetData());
        return response;
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
        String name = getDownloadFilename(file);
        if ("excel".equals(type)) {
            byte[] bytes = buildMinimalXlsx(file.getSheetData());
            return new DownloadPayload(bytes, name, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        }
        String text = file.getSheetData() != null ? file.getSheetData()
                : (file.getContent() != null ? file.getContent() : "");
        String contentType = "markdown".equals(type) ? "text/markdown; charset=utf-8"
                : ("word".equals(type) ? "application/json; charset=utf-8" : "text/plain; charset=utf-8");
        return new DownloadPayload(text.getBytes(StandardCharsets.UTF_8), name, contentType);
    }

    @Transactional(readOnly = true)
    public String getDownloadFilename(Long fileId, Long userId) {
        File file = requireExisting(fileId);
        if (Boolean.TRUE.equals(file.getIsDeleted()) || !hasAccess(file, userId)) {
            throw new UnauthorizedException("您没有访问该文件的权限");
        }
        return getDownloadFilename(file);
    }

    private String getDownloadFilename(File file) {
        String originalName = file.getName() == null || file.getName().trim().isEmpty() ? "download" : file.getName();
        int extensionIndex = originalName.lastIndexOf('.');
        String baseName = extensionIndex > 0 ? originalName.substring(0, extensionIndex) : originalName;
        String extension = extensionIndex > 0 ? originalName.substring(extensionIndex) : "";
        if ("excel".equals(file.getDocumentType())) {
            extension = ".xlsx";
        }
        String timestamp = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMddHHmmss"));
        return baseName + "-V" + fileVersionService.getLatestVersionNumber(file.getId()) + "-" + timestamp + extension;
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

    /**
     * Converts uploaded spreadsheets to the compact Luckysheet-compatible shape
     * already understood by the Univer adapter in the web client. Storing that
     * snapshot at upload time prevents a newly uploaded file from opening as an
     * empty worksheet.
     */
    private String importSpreadsheet(byte[] bytes, String filename) throws IOException {
        if (filename.toLowerCase(Locale.ROOT).endsWith(".csv")) {
            return objectMapper.writeValueAsString(Collections.singletonList(
                    createSheetSnapshot("Sheet1", csvRows(new String(bytes, StandardCharsets.UTF_8)))));
        }

        try (Workbook workbook = WorkbookFactory.create(new ByteArrayInputStream(bytes))) {
            DataFormatter formatter = new DataFormatter(Locale.SIMPLIFIED_CHINESE);
            List<Map<String, Object>> snapshots = new ArrayList<>();
            for (int sheetIndex = 0; sheetIndex < workbook.getNumberOfSheets(); sheetIndex++) {
                Sheet sheet = workbook.getSheetAt(sheetIndex);
                List<List<String>> rows = new ArrayList<>();
                int maxColumns = 0;
                for (int rowIndex = 0; rowIndex <= sheet.getLastRowNum(); rowIndex++) {
                    Row row = sheet.getRow(rowIndex);
                    List<String> values = new ArrayList<>();
                    int lastCell = row == null ? 0 : Math.max(row.getLastCellNum(), 0);
                    maxColumns = Math.max(maxColumns, lastCell);
                    for (int columnIndex = 0; columnIndex < lastCell; columnIndex++) {
                        Cell cell = row.getCell(columnIndex, Row.MissingCellPolicy.RETURN_BLANK_AS_NULL);
                        values.add(cell == null ? "" : formatter.formatCellValue(cell));
                    }
                    rows.add(values);
                }
                Map<String, Object> snapshot = createSheetSnapshot(sheet.getSheetName(), rows);
                snapshot.put("column", Math.max(26, maxColumns));
                snapshots.add(snapshot);
            }
            if (snapshots.isEmpty()) {
                snapshots.add(createSheetSnapshot("Sheet1", Collections.<List<String>>emptyList()));
            }
            return objectMapper.writeValueAsString(snapshots);
        } catch (Exception e) {
            throw new IOException("Excel 文件解析失败，请确认文件格式是否正确", e);
        }
    }

    private Map<String, Object> createSheetSnapshot(String name, List<List<String>> rows) {
        Map<String, Object> sheet = new LinkedHashMap<>();
        List<Map<String, Object>> cells = new ArrayList<>();
        int maxColumns = 0;
        for (int rowIndex = 0; rowIndex < rows.size(); rowIndex++) {
            List<String> row = rows.get(rowIndex);
            maxColumns = Math.max(maxColumns, row.size());
            for (int columnIndex = 0; columnIndex < row.size(); columnIndex++) {
                String value = row.get(columnIndex);
                if (value == null || value.isEmpty()) continue;
                Map<String, Object> cell = new LinkedHashMap<>();
                cell.put("r", rowIndex);
                cell.put("c", columnIndex);
                cell.put("v", value);
                cells.add(cell);
            }
        }
        sheet.put("name", name == null || name.trim().isEmpty() ? "Sheet1" : name);
        sheet.put("row", Math.max(100, rows.size()));
        sheet.put("column", Math.max(26, maxColumns));
        sheet.put("celldata", cells);
        return sheet;
    }

    private List<List<String>> csvRows(String text) {
        String normalized = text != null && text.startsWith("\uFEFF") ? text.substring(1) : text;
        List<List<String>> rows = new ArrayList<>();
        for (String line : (normalized == null ? "" : normalized).split("\\r?\\n", -1)) {
            if (line.isEmpty() && rows.isEmpty()) continue;
            rows.add(parseCsvLine(line));
        }
        return rows;
    }

    private List<String> parseCsvLine(String line) {
        List<String> values = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        boolean quoted = false;
        for (int index = 0; index < line.length(); index++) {
            char ch = line.charAt(index);
            if (ch == '"') {
                if (quoted && index + 1 < line.length() && line.charAt(index + 1) == '"') {
                    current.append(ch);
                    index++;
                } else {
                    quoted = !quoted;
                }
            } else if (ch == ',' && !quoted) {
                values.add(current.toString());
                current.setLength(0);
            } else {
                current.append(ch);
            }
        }
        values.add(current.toString());
        return values;
    }

    private String extractWordText(byte[] bytes) throws IOException {
        try (XWPFDocument document = new XWPFDocument(new ByteArrayInputStream(bytes))) {
            List<String> blocks = new ArrayList<>();
            document.getParagraphs().forEach(paragraph -> {
                String text = paragraph.getText();
                if (text != null && !text.trim().isEmpty()) blocks.add(text);
            });
            document.getTables().forEach(table -> table.getRows().forEach(row -> {
                List<String> cells = row.getTableCells().stream()
                        .map(cell -> cell.getText() == null ? "" : cell.getText().trim())
                        .collect(Collectors.toList());
                if (!cells.isEmpty()) blocks.add(String.join("\t", cells));
            }));
            return String.join("\n", blocks);
        } catch (Exception e) {
            throw new IOException("Word 文件解析失败，请确认文件格式是否正确", e);
        }
    }

    private byte[] buildMinimalXlsx(String sheetDataJson) throws IOException {
        try (Workbook workbook = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            if (sheetDataJson != null && !sheetDataJson.isEmpty() && !sheetDataJson.equals("{}")) {
                try {
                    JsonNode root = objectMapper.readTree(sheetDataJson);
                    if (isUniverWorkbook(root)) {
                        writeUniverWorkbook(workbook, root);
                    } else if (isLuckysheetSnapshot(root)) {
                        for (JsonNode sourceSheet : root) {
                            writeLuckysheetSheet(workbook, sourceSheet);
                        }
                    } else if (root.isArray()) {
                        Sheet sheet = workbook.createSheet("Sheet1");
                        int r = 0;
                        for (JsonNode rowNode : root) {
                            Row row = sheet.createRow(r++);
                            int c = 0;
                            if (rowNode.isArray()) {
                                for (JsonNode cellNode : rowNode) {
                                    Cell cell = row.createCell(c++);
                                    writeCellValue(cell, cellNode);
                                }
                            }
                        }
                    } else {
                        Sheet sheet = workbook.createSheet("Sheet1");
                        Row row = sheet.createRow(0);
                        row.createCell(0).setCellValue(sheetDataJson);
                    }
                } catch (Exception ignored) {
                    Sheet sheet = workbook.createSheet("Sheet1");
                    Row row = sheet.createRow(0);
                    row.createCell(0).setCellValue(sheetDataJson);
                }
            }
            if (workbook.getNumberOfSheets() == 0) {
                workbook.createSheet("Sheet1");
            }
            workbook.write(out);
            return out.toByteArray();
        }
    }

    private boolean isUniverWorkbook(JsonNode root) {
        return root != null && root.isObject() && root.has("sheets") && root.get("sheets").isObject();
    }

    private boolean isLuckysheetSnapshot(JsonNode root) {
        return root.isArray() && root.size() > 0 && root.get(0).has("celldata");
    }

    private void writeUniverWorkbook(Workbook workbook, JsonNode root) {
        JsonNode sheetsNode = root.path("sheets");
        JsonNode orderNode = root.path("sheetOrder");
        List<String> order = new ArrayList<>();
        if (orderNode.isArray()) {
            for (JsonNode item : orderNode) {
                if (item.isTextual()) order.add(item.asText());
            }
        }
        if (order.isEmpty()) {
            Iterator<String> names = sheetsNode.fieldNames();
            while (names.hasNext()) order.add(names.next());
        }
        Set<String> usedNames = new HashSet<>();
        for (String sheetId : order) {
            JsonNode sourceSheet = sheetsNode.path(sheetId);
            if (sourceSheet.isMissingNode() || sourceSheet.isNull()) continue;
            String rawName = sourceSheet.path("name").asText(sheetId);
            if (rawName == null || rawName.trim().isEmpty()) rawName = "Sheet1";
            String name = uniqueSheetName(rawName, usedNames);
            usedNames.add(name.toLowerCase(Locale.ROOT));
            Sheet sheet = workbook.createSheet(name);
            writeUniverSheet(sheet, sourceSheet.path("cellData"));
        }
    }

    private void writeUniverSheet(Sheet sheet, JsonNode cellData) {
        if (cellData == null || !cellData.isObject()) return;
        Iterator<Map.Entry<String, JsonNode>> rows = cellData.fields();
        while (rows.hasNext()) {
            Map.Entry<String, JsonNode> rowEntry = rows.next();
            int rowIndex;
            try {
                rowIndex = Integer.parseInt(rowEntry.getKey());
            } catch (NumberFormatException ex) {
                continue;
            }
            if (rowIndex < 0) continue;
            JsonNode cols = rowEntry.getValue();
            if (cols == null || !cols.isObject()) continue;
            Row row = sheet.getRow(rowIndex);
            if (row == null) row = sheet.createRow(rowIndex);
            Iterator<Map.Entry<String, JsonNode>> colIt = cols.fields();
            while (colIt.hasNext()) {
                Map.Entry<String, JsonNode> colEntry = colIt.next();
                int colIndex;
                try {
                    colIndex = Integer.parseInt(colEntry.getKey());
                } catch (NumberFormatException ex) {
                    continue;
                }
                if (colIndex < 0) continue;
                Cell cell = row.getCell(colIndex);
                if (cell == null) cell = row.createCell(colIndex);
                writeUniverCell(cell, colEntry.getValue());
            }
        }
    }

    private void writeUniverCell(Cell cell, JsonNode cellNode) {
        if (cellNode == null || cellNode.isNull()) {
            cell.setBlank();
            return;
        }
        // Univer cell shape: { v, t, f, p, ... }
        JsonNode value = cellNode.has("v") ? cellNode.get("v") : cellNode;
        if (value != null && value.isObject() && value.has("v")) {
            value = value.get("v");
        }
        writeCellValue(cell, value);
    }

    private void writeCellValue(Cell cell, JsonNode value) {
        if (value == null || value.isNull()) {
            cell.setBlank();
            return;
        }
        if (value.isNumber()) {
            cell.setCellValue(value.asDouble());
            return;
        }
        if (value.isBoolean()) {
            cell.setCellValue(value.asBoolean());
            return;
        }
        String text = value.asText("");
        // Prefer numeric parsing for plain number strings.
        if (!text.isEmpty()) {
            try {
                if (text.matches("^-?\\d+(\\.\\d+)?$")) {
                    cell.setCellValue(Double.parseDouble(text));
                    return;
                }
            } catch (Exception ignored) {
                // fall through
            }
        }
        cell.setCellValue(text);
    }

    private String uniqueSheetName(String rawName, Set<String> usedNames) {
        String base = rawName.length() > 31 ? rawName.substring(0, 31) : rawName;
        String candidate = base;
        int i = 1;
        while (usedNames.contains(candidate.toLowerCase(Locale.ROOT))) {
            String suffix = "(" + i + ")";
            int max = Math.max(1, 31 - suffix.length());
            candidate = (base.length() > max ? base.substring(0, max) : base) + suffix;
            i++;
        }
        return candidate;
    }

    private void writeLuckysheetSheet(Workbook workbook, JsonNode sourceSheet) {
        String name = sourceSheet.path("name").asText("Sheet1");
        Sheet sheet = workbook.createSheet(name.isEmpty() ? "Sheet1" : name);
        for (JsonNode sourceCell : sourceSheet.path("celldata")) {
            int rowIndex = sourceCell.path("r").asInt(-1);
            int columnIndex = sourceCell.path("c").asInt(-1);
            if (rowIndex < 0 || columnIndex < 0) continue;
            Row row = sheet.getRow(rowIndex);
            if (row == null) row = sheet.createRow(rowIndex);
            Cell cell = row.createCell(columnIndex);
            JsonNode value = sourceCell.path("v");
            if (value.isObject() && value.has("v")) {
                value = value.get("v");
            }
            writeCellValue(cell, value);
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
