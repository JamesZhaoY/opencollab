package com.opencollab.websocket;

import com.opencollab.entity.File;
import com.opencollab.entity.User;
import com.opencollab.security.JwtTokenProvider;
import com.opencollab.security.CustomUserDetailsService;
import com.opencollab.service.FileService;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;

import javax.servlet.http.HttpServletRequest;
import java.net.URI;
import java.util.Map;

@Component
public class JwtHandshakeInterceptor implements HandshakeInterceptor {

    private final JwtTokenProvider jwtTokenProvider;
    private final CustomUserDetailsService userDetailsService;
    private final FileService fileService;

    public JwtHandshakeInterceptor(JwtTokenProvider jwtTokenProvider,
                                   CustomUserDetailsService userDetailsService,
                                   FileService fileService) {
        this.jwtTokenProvider = jwtTokenProvider;
        this.userDetailsService = userDetailsService;
        this.fileService = fileService;
    }

    @Override
    public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response,
                                   WebSocketHandler wsHandler, Map<String, Object> attributes) {
        if (!(request instanceof ServletServerHttpRequest)) {
            return false;
        }
        HttpServletRequest servletRequest = ((ServletServerHttpRequest) request).getServletRequest();
        String token = servletRequest.getParameter("token");
        if (token == null || token.isEmpty()) {
            String auth = servletRequest.getHeader("Authorization");
            if (auth != null && auth.startsWith("Bearer ")) {
                token = auth.substring(7);
            }
        }
        if (token == null || !jwtTokenProvider.validateToken(token)) {
            return false;
        }

        Long fileId = extractFileId(request.getURI());
        if (fileId == null) {
            return false;
        }

        try {
            String username = jwtTokenProvider.extractUsername(token);
            User user = userDetailsService.getUserByUsername(username);
            // getFileEntityById also rejects deleted files and users without a share record.
            File file = fileService.getFileEntityById(fileId, user.getId());
            String permission = fileService.resolvePermission(file, user.getId());

            attributes.put("token", token);
            attributes.put("username", username);
            attributes.put("fileId", fileId);
            attributes.put("canWrite", "owner".equals(permission) || "edit".equals(permission));
            return true;
        } catch (RuntimeException ex) {
            // Do not expose file existence or permission details during the WS handshake.
            return false;
        }
    }

    @Override
    public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response,
                               WebSocketHandler wsHandler, Exception exception) {
        // no-op
    }

    private Long extractFileId(URI uri) {
        if (uri == null || uri.getPath() == null) {
            return null;
        }
        String path = uri.getPath();
        if (path.endsWith("/")) {
            path = path.substring(0, path.length() - 1);
        }
        int separator = path.lastIndexOf('/');
        if (separator < 0 || separator == path.length() - 1) {
            return null;
        }
        try {
            return Long.valueOf(path.substring(separator + 1));
        } catch (NumberFormatException ex) {
            return null;
        }
    }
}
