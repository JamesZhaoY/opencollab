package com.opencollab.security;

import com.opencollab.dto.Result;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.stereotype.Component;
import com.fasterxml.jackson.databind.ObjectMapper;

import javax.servlet.ServletException;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

@Component
public class JwtAuthenticationEntryPoint implements AuthenticationEntryPoint {

    private static final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public void commence(HttpServletRequest request, HttpServletResponse response, AuthenticationException authException) throws ServletException {
        try {
            Result<Object> result = Result.failure(
                HttpStatus.UNAUTHORIZED.value(),
                "登录状态已失效，请重新登录"
            );
            response.setStatus(HttpStatus.UNAUTHORIZED.value());
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.setCharacterEncoding("UTF-8");
            // Entry point ObjectMapper is standalone; write snake_case-friendly map
            java.util.Map<String, Object> body = new java.util.HashMap<>();
            body.put("code", result.getCode());
            body.put("message", result.getMessage());
            body.put("detail", result.getDetail());
            body.put("data", null);
            objectMapper.writeValue(response.getOutputStream(), body);
        } catch (Exception e) {
            throw new ServletException(e);
        }
    }
}
