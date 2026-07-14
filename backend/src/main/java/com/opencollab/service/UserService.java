package com.opencollab.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.opencollab.dto.*;
import com.opencollab.entity.User;
import com.opencollab.exception.ResourceAlreadyExistsException;
import com.opencollab.exception.ResourceNotFoundException;
import com.opencollab.mapper.UserMapper;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Service
public class UserService {

    private final UserMapper userMapper;
    private final PasswordEncoder passwordEncoder;

    public UserService(UserMapper userMapper, PasswordEncoder passwordEncoder) {
        this.userMapper = userMapper;
        this.passwordEncoder = passwordEncoder;
    }

    @Transactional(readOnly = true)
    public List<UserResponse> getAllUsers() {
        return userMapper.selectList(null).stream()
                .map(this::toUserResponse)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public UserResponse getUserById(Long id) {
        User user = userMapper.selectById(id);
        if (user == null) {
            throw new ResourceNotFoundException("User not found with id: " + id);
        }
        return toUserResponse(user);
    }

    @Transactional(readOnly = true)
    public UserResponse getUserByUsername(String username) {
        User user = userMapper.selectOne(
                new LambdaQueryWrapper<User>().eq(User::getUsername, username));
        if (user == null) {
            throw new ResourceNotFoundException("User not found: " + username);
        }
        return toUserResponse(user);
    }

    @Transactional(readOnly = true)
    public List<UserResponse> searchUsers(String query) {
        return userMapper.selectList(
                new LambdaQueryWrapper<User>()
                        .like(User::getUsername, query)
                        .or()
                        .like(User::getEmail, query))
                .stream()
                .map(this::toUserResponse)
                .collect(Collectors.toList());
    }

    @Transactional
    public UserResponse createUser(AdminCreateUserRequest request) {
        if (userMapper.selectCount(new LambdaQueryWrapper<User>().eq(User::getUsername, request.getUsername())) > 0) {
            throw new ResourceAlreadyExistsException("Username already exists");
        }
        if (userMapper.selectCount(new LambdaQueryWrapper<User>().eq(User::getEmail, request.getEmail())) > 0) {
            throw new ResourceAlreadyExistsException("Email already exists");
        }

        User user = new User();
        user.setUsername(request.getUsername());
        user.setEmail(request.getEmail());
        user.setPasswordHash(passwordEncoder.encode(request.getPassword()));
        user.setRole(request.getRole() != null ? request.getRole() : "user");
        user.setDepartment(request.getDepartment());
        user.setIsActive(true);

        userMapper.insert(user);
        return toUserResponse(user);
    }

    @Transactional
    public UserResponse updateUser(Long id, UserUpdateRequest request) {
        User user = userMapper.selectById(id);
        if (user == null) {
            throw new ResourceNotFoundException("User not found with id: " + id);
        }

        if (request.getEmail() != null) {
            Long dup = userMapper.selectCount(new LambdaQueryWrapper<User>().eq(User::getEmail, request.getEmail()));
            if (dup > 0 && !user.getEmail().equals(request.getEmail())) {
                throw new ResourceAlreadyExistsException("Email already exists");
            }
            user.setEmail(request.getEmail());
        }

        if (request.getDepartment() != null) {
            user.setDepartment(request.getDepartment());
        }

        if (request.getIsActive() != null) {
            user.setIsActive(request.getIsActive());
        }

        userMapper.updateById(user);
        return toUserResponse(user);
    }

    @Transactional
    public void deleteUser(Long id) {
        User user = userMapper.selectById(id);
        if (user == null) {
            throw new ResourceNotFoundException("User not found with id: " + id);
        }
        user.setIsActive(false);
        userMapper.updateById(user);
    }

    @Transactional
    public void resetPassword(Long id, String newPassword) {
        User user = userMapper.selectById(id);
        if (user == null) {
            throw new ResourceNotFoundException("User not found with id: " + id);
        }
        user.setPasswordHash(passwordEncoder.encode(newPassword));
        userMapper.updateById(user);
    }

    private UserResponse toUserResponse(User user) {
        UserResponse response = new UserResponse();
        response.setId(user.getId());
        response.setUsername(user.getUsername());
        response.setEmail(user.getEmail());
        response.setRole(user.getRole());
        response.setDepartment(user.getDepartment());
        response.setIsActive(user.getIsActive());
        response.setCreatedAt(user.getCreatedAt());
        return response;
    }
}
