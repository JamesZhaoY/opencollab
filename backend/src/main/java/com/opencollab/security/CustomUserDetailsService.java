package com.opencollab.security;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.opencollab.entity.User;
import com.opencollab.mapper.UserMapper;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collections;
import java.util.List;

@Service
public class CustomUserDetailsService implements UserDetailsService {

    private final UserMapper userMapper;

    public CustomUserDetailsService(UserMapper userMapper) {
        this.userMapper = userMapper;
    }

    @Override
    @Transactional(readOnly = true)
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        User user = userMapper.selectOne(
                new LambdaQueryWrapper<User>().eq(User::getUsername, username));
        if (user == null) {
            throw new UsernameNotFoundException("用户名或密码错误");
        }

        return new org.springframework.security.core.userdetails.User(
                user.getUsername(),
                user.getPasswordHash(),
                user.getIsActive(),
                true,
                true,
                true,
                getAuthorities(user.getRole())
        );
    }

    private List<SimpleGrantedAuthority> getAuthorities(String role) {
        if (role == null || role.isEmpty()) {
            return Collections.singletonList(new SimpleGrantedAuthority("ROLE_USER"));
        }
        return Collections.singletonList(new SimpleGrantedAuthority("ROLE_" + role.toUpperCase()));
    }

    @Transactional(readOnly = true)
    public User getUserByUsername(String username) {
        User user = userMapper.selectOne(
                new LambdaQueryWrapper<User>().eq(User::getUsername, username));
        if (user == null) {
            throw new UsernameNotFoundException("用户不存在");
        }
        return user;
    }

    /**
     * Resolve the numeric user id for a {@link UserDetails} principal (the JWT auth flow
     * populates the principal from the username, so we look it up here).
     */
    @Transactional(readOnly = true)
    public Long getUserIdFromDetails(UserDetails userDetails) {
        return getUserByUsername(userDetails.getUsername()).getId();
    }
}
