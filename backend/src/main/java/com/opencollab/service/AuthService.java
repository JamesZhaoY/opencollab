package com.opencollab.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.opencollab.dto.*;
import com.opencollab.entity.User;
import com.opencollab.exception.ResourceAlreadyExistsException;
import com.opencollab.mapper.UserMapper;
import com.opencollab.security.CustomUserDetailsService;
import com.opencollab.security.JwtTokenProvider;

import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {

    private final AuthenticationManager authenticationManager;
    private final UserMapper userMapper;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider jwtTokenProvider;
    private final CustomUserDetailsService userDetailsService;

    public AuthService(AuthenticationManager authenticationManager,
                       UserMapper userMapper,
                       PasswordEncoder passwordEncoder,
                       JwtTokenProvider jwtTokenProvider,
                       CustomUserDetailsService userDetailsService) {
        this.authenticationManager = authenticationManager;
        this.userMapper = userMapper;
        this.passwordEncoder = passwordEncoder;
        this.jwtTokenProvider = jwtTokenProvider;
        this.userDetailsService = userDetailsService;
    }

    @Transactional
    public TokenResponse login(LoginRequest request) {
        Authentication authentication = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(request.getUsername(), request.getPassword())
        );
        SecurityContextHolder.getContext().setAuthentication(authentication);

        UserDetails userDetails = (UserDetails) authentication.getPrincipal();
        String accessToken = jwtTokenProvider.generateToken(userDetails);
        String refreshToken = jwtTokenProvider.generateRefreshToken(userDetails);

        return new TokenResponse(accessToken, refreshToken, "Bearer", 900L);
    }

    @Transactional
    public UserResponse register(RegisterRequest request) {
        if (userMapper.selectCount(new LambdaQueryWrapper<User>().eq(User::getUsername, request.getUsername())) > 0) {
            throw new ResourceAlreadyExistsException("用户名已存在");
        }
        if (userMapper.selectCount(new LambdaQueryWrapper<User>().eq(User::getEmail, request.getEmail())) > 0) {
            throw new ResourceAlreadyExistsException("邮箱已被使用");
        }

        User user = new User();
        user.setUsername(request.getUsername());
        user.setEmail(request.getEmail());
        user.setPasswordHash(passwordEncoder.encode(request.getPassword()));
        user.setRole("user");
        user.setDepartment(request.getDepartment());
        user.setIsActive(true);

        userMapper.insert(user);
        return toUserResponse(user);
    }

    @Transactional
    public TokenResponse refreshToken(String refreshToken) {
        String username = jwtTokenProvider.extractUsername(refreshToken);
        if (username == null) {
            throw new IllegalArgumentException("登录状态无效，请重新登录");
        }

        UserDetails userDetails = userDetailsService.loadUserByUsername(username);
        if (!jwtTokenProvider.validateToken(refreshToken, userDetails)) {
            throw new IllegalArgumentException("登录状态已过期，请重新登录");
        }

        String newAccessToken = jwtTokenProvider.generateToken(userDetails);
        return new TokenResponse(newAccessToken, refreshToken, "Bearer", 900L);
    }

    public UserResponse getCurrentUser(String username) {
        User user = userDetailsService.getUserByUsername(username);
        return toUserResponse(user);
    }

    @Transactional
    public void changePassword(String username, String oldPassword, String newPassword) {
        User user = userDetailsService.getUserByUsername(username);
        if (!passwordEncoder.matches(oldPassword, user.getPasswordHash())) {
            throw new IllegalArgumentException("当前密码不正确");
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
