package com.opencollab.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.opencollab.dto.*;
import com.opencollab.entity.File;
import com.opencollab.entity.Permission;
import com.opencollab.entity.User;
import com.opencollab.exception.ResourceNotFoundException;
import com.opencollab.exception.UnauthorizedException;
import com.opencollab.mapper.FileMapper;
import com.opencollab.mapper.PermissionMapper;
import com.opencollab.mapper.UserMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Service
public class PermissionService {

    private final PermissionMapper permissionMapper;
    private final FileMapper fileMapper;
    private final UserMapper userMapper;

    public PermissionService(PermissionMapper permissionMapper,
                             FileMapper fileMapper,
                             UserMapper userMapper) {
        this.permissionMapper = permissionMapper;
        this.fileMapper = fileMapper;
        this.userMapper = userMapper;
    }

    @Transactional(readOnly = true)
    public List<PermissionResponse> getPermissionsForFile(Long fileId, Long userId) {
        File file = fileMapper.selectById(fileId);
        if (file == null) {
            throw new ResourceNotFoundException("File not found");
        }
        if (!file.getOwnerId().equals(userId)) {
            throw new UnauthorizedException("Only file owner can view permissions");
        }
        return permissionMapper.selectList(
                new LambdaQueryWrapper<Permission>().eq(Permission::getFileId, fileId))
                .stream()
                .map(this::toPermissionResponse)
                .collect(Collectors.toList());
    }

    @Transactional
    public PermissionResponse grantPermission(GrantPermissionRequest request, Long granterId) {
        File file = fileMapper.selectById(request.getFileId());
        if (file == null) {
            throw new ResourceNotFoundException("File not found");
        }
        if (!file.getOwnerId().equals(granterId)) {
            throw new UnauthorizedException("Only file owner can share the file");
        }
        User grantee = userMapper.selectById(request.getUserId());
        if (grantee == null) {
            throw new ResourceNotFoundException("User not found");
        }

        Permission permission = permissionMapper.selectOne(
                new LambdaQueryWrapper<Permission>()
                        .eq(Permission::getFileId, request.getFileId())
                        .eq(Permission::getUserId, request.getUserId()));
        if (permission != null) {
            permission.setPermission(request.getPermission());
        } else {
            permission = new Permission();
            permission.setFileId(request.getFileId());
            permission.setUserId(request.getUserId());
            permission.setPermission(request.getPermission());
            permission.setGrantedBy(granterId);
            permissionMapper.insert(permission);
            return toPermissionResponse(permission);
        }
        permissionMapper.updateById(permission);
        return toPermissionResponse(permission);
    }

    @Transactional
    public void revokePermission(Long fileId, Long userId, Long granterId) {
        File file = fileMapper.selectById(fileId);
        if (file == null) {
            throw new ResourceNotFoundException("File not found");
        }
        if (!file.getOwnerId().equals(granterId)) {
            throw new UnauthorizedException("Only file owner can revoke permissions");
        }
        Permission permission = permissionMapper.selectOne(
                new LambdaQueryWrapper<Permission>()
                        .eq(Permission::getFileId, fileId)
                        .eq(Permission::getUserId, userId));
        if (permission == null) {
            throw new ResourceNotFoundException("Permission not found");
        }
        permissionMapper.deleteById(permission.getId());
    }

    private PermissionResponse toPermissionResponse(Permission permission) {
        PermissionResponse response = new PermissionResponse();
        response.setId(permission.getId());
        response.setFileId(permission.getFileId());
        response.setUserId(permission.getUserId());
        response.setPermission(permission.getPermission());
        response.setGrantedBy(permission.getGrantedBy());
        response.setCreatedAt(permission.getCreatedAt());

        File file = fileMapper.selectById(permission.getFileId());
        if (file != null) {
            response.setFileName(file.getName());
        }
        User user = userMapper.selectById(permission.getUserId());
        if (user != null) {
            response.setUsername(user.getUsername());
        }
        User granter = userMapper.selectById(permission.getGrantedBy());
        if (granter != null) {
            response.setGranterUsername(granter.getUsername());
        }

        return response;
    }
}
