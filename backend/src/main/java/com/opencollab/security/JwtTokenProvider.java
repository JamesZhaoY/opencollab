package com.opencollab.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.MalformedJwtException;
import io.jsonwebtoken.SignatureException;
import io.jsonwebtoken.UnsupportedJwtException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * JWT utility. Redis-backed token blacklist for revocation.
 */
@Component
public class JwtTokenProvider {

    @Value("${jwt.secret:change-this-secret-key-in-production}")
    private String secret;

    @Value("${jwt.expiration:900000}")
    private Long expiration;

    @Value("${jwt.refresh-expiration:604800000}")
    private Long refreshExpiration;

    @Autowired
    private StringRedisTemplate redisTemplate;

    public String extractUsername(String token) {
        return extractClaim(token, Claims::getSubject);
    }

    public Date extractExpiration(String token) {
        return extractClaim(token, Claims::getExpiration);
    }

    public <T> T extractClaim(String token, Function<Claims, T> claimsResolver) {
        final Claims claims = extractAllClaims(token);
        return claimsResolver.apply(claims);
    }

    private Claims extractAllClaims(String token) {
        return Jwts.parser()
                .setSigningKey(secret)
                .parseClaimsJws(token)
                .getBody();
    }

    private Boolean isTokenExpired(String token) {
        return extractExpiration(token).before(new Date());
    }

    public String generateToken(UserDetails userDetails) {
        Map<String, Object> claims = new HashMap<>();
        claims.put("roles", userDetails.getAuthorities().stream()
                .map(auth -> auth.getAuthority())
                .collect(Collectors.toList()));
        return createToken(claims, userDetails.getUsername());
    }

    public String generateRefreshToken(UserDetails userDetails) {
        Map<String, Object> claims = new HashMap<>();
        return createRefreshToken(claims, userDetails.getUsername());
    }

    private String createToken(Map<String, Object> claims, String subject) {
        return Jwts.builder()
                .setClaims(claims)
                .setSubject(subject)
                .setIssuedAt(new Date(System.currentTimeMillis()))
                .setExpiration(new Date(System.currentTimeMillis() + expiration))
                .signWith(io.jsonwebtoken.SignatureAlgorithm.HS256, secret)
                .compact();
    }

    private String createRefreshToken(Map<String, Object> claims, String subject) {
        return Jwts.builder()
                .setClaims(claims)
                .setSubject(subject)
                .setIssuedAt(new Date(System.currentTimeMillis()))
                .setExpiration(new Date(System.currentTimeMillis() + refreshExpiration))
                .signWith(io.jsonwebtoken.SignatureAlgorithm.HS256, secret)
                .compact();
    }

    public List<SimpleGrantedAuthority> extractRoles(String token) {
        try {
            Claims claims = extractAllClaims(token);
            List<String> roles = claims.get("roles", List.class);
            if (roles == null) {
                return Collections.emptyList();
            }
            return roles.stream()
                    .map(SimpleGrantedAuthority::new)
                    .collect(Collectors.toList());
        } catch (Exception e) {
            return Collections.emptyList();
        }
    }

    private boolean isTokenRevoked(String token) {
        try {
            Boolean exists = redisTemplate.hasKey("revoked:" + token);
            return exists != null && exists;
        } catch (Exception e) {
            return false; // fail-open if Redis unavailable
        }
    }

    /** Revoke using access-token TTL. */
    public void revokeToken(String token) {
        revokeToken(token, expiration);
    }

    /** Revoke with explicit TTL (e.g. refresh token lifetime). */
    public void revokeToken(String token, long ttlMs) {
        if (token == null || token.isEmpty() || redisTemplate == null) {
            return;
        }
        long ttl = Math.max(ttlMs, 1000L);
        try {
            // Prefer remaining lifetime if token is still parseable
            Date exp = extractExpiration(token);
            long remaining = exp.getTime() - System.currentTimeMillis();
            if (remaining > 0) {
                ttl = remaining;
            }
        } catch (Exception ignored) {
            // use provided ttl
        }
        try {
            redisTemplate.opsForValue().set("revoked:" + token, "1", ttl, TimeUnit.MILLISECONDS);
        } catch (Exception ignored) {
            // fail-open
        }
    }

    public long getRefreshExpiration() {
        return refreshExpiration;
    }

    public Boolean validateToken(String token, UserDetails userDetails) {
        final String username = extractUsername(token);
        return (username.equals(userDetails.getUsername()) && !isTokenExpired(token) && !isTokenRevoked(token));
    }

    public Boolean validateToken(String token) {
        try {
            extractAllClaims(token);
            return !isTokenExpired(token) && !isTokenRevoked(token);
        } catch (SignatureException | MalformedJwtException | ExpiredJwtException | UnsupportedJwtException | IllegalArgumentException e) {
            return false;
        }
    }
}
