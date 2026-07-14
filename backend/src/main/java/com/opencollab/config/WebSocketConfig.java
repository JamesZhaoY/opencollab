package com.opencollab.config;

import com.opencollab.websocket.CollabWebSocketHandler;
import com.opencollab.websocket.JwtHandshakeInterceptor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

import java.util.List;

/**
 * Raw WebSocket (not STOMP) for y-websocket binary room relay.
 */
@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {

    private final CollabWebSocketHandler collabWebSocketHandler;
    private final JwtHandshakeInterceptor jwtHandshakeInterceptor;

    @Value("${app.allowed-origins:http://localhost:5173}")
    private List<String> allowedOrigins;

    public WebSocketConfig(CollabWebSocketHandler collabWebSocketHandler,
                           JwtHandshakeInterceptor jwtHandshakeInterceptor) {
        this.collabWebSocketHandler = collabWebSocketHandler;
        this.jwtHandshakeInterceptor = jwtHandshakeInterceptor;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        String[] origins = allowedOrigins.toArray(new String[0]);
        registry.addHandler(collabWebSocketHandler, "/ws", "/ws/**")
                .addInterceptors(jwtHandshakeInterceptor)
                .setAllowedOrigins(origins);
    }
}
