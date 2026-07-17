package com.opencollab.service;

import com.opencollab.dto.ExcelLockResponse;
import com.opencollab.entity.User;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.Collections;

/** Redis-backed, expiring exclusive lock for an actively edited Excel cell. */
@Service
public class ExcelLockService {

    private static final Duration LOCK_TTL = Duration.ofSeconds(45);
    private static final DefaultRedisScript<Long> COMPARE_AND_DELETE = new DefaultRedisScript<>(
            "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
            Long.class);

    private final StringRedisTemplate redisTemplate;

    public ExcelLockService(StringRedisTemplate redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    public ExcelLockResponse acquire(Long fileId, String sheetId, int row, int column, User user) {
        String key = lockKey(fileId, sheetId, row, column);
        String owner = ownerValue(user);
        Boolean acquired = redisTemplate.opsForValue().setIfAbsent(key, owner, LOCK_TTL);
        if (Boolean.TRUE.equals(acquired)) {
            return new ExcelLockResponse(true, user.getUsername());
        }

        String existing = redisTemplate.opsForValue().get(key);
        if (owner.equals(existing)) {
            redisTemplate.expire(key, LOCK_TTL);
            return new ExcelLockResponse(true, user.getUsername());
        }
        return new ExcelLockResponse(false, ownerUsername(existing));
    }

    public void release(Long fileId, String sheetId, int row, int column, User user) {
        redisTemplate.execute(
                COMPARE_AND_DELETE,
                Collections.singletonList(lockKey(fileId, sheetId, row, column)),
                ownerValue(user));
    }

    private String lockKey(Long fileId, String sheetId, int row, int column) {
        String encodedSheet = Base64.getUrlEncoder().withoutPadding()
                .encodeToString(sheetId.getBytes(StandardCharsets.UTF_8));
        return "opencollab:excel-lock:" + fileId + ':' + encodedSheet + ':' + row + ':' + column;
    }

    private String ownerValue(User user) {
        return user.getId() + "|" + user.getUsername();
    }

    private String ownerUsername(String value) {
        if (value == null || value.isEmpty()) return "其他用户";
        int separator = value.indexOf('|');
        return separator >= 0 && separator + 1 < value.length() ? value.substring(separator + 1) : "其他用户";
    }
}
