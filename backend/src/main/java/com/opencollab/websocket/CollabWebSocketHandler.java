package com.opencollab.websocket;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.BinaryMessage;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.AbstractWebSocketHandler;

import java.io.IOException;
import java.net.URI;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArraySet;

/**
 * Binary (and text) room relay for y-websocket clients.
 * Room id = last path segment of /ws/{fileId}.
 */
@Component
public class CollabWebSocketHandler extends AbstractWebSocketHandler {

    private static final Logger logger = LoggerFactory.getLogger(CollabWebSocketHandler.class);

    private final Map<Long, Set<WebSocketSession>> fileSessions = new ConcurrentHashMap<>();
    private final Map<String, Long> sessionFileMap = new ConcurrentHashMap<>();

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        Long fileId = extractFileId(session);
        if (fileId == null) {
            session.close(CloseStatus.BAD_DATA);
            logger.warn("WebSocket missing fileId in path: {}", session.getUri());
            return;
        }
        sessionFileMap.put(session.getId(), fileId);
        fileSessions.computeIfAbsent(fileId, k -> new CopyOnWriteArraySet<>()).add(session);
        String username = String.valueOf(session.getAttributes().get("username"));
        logger.info("WebSocket connected user={} fileId={} session={}", username, fileId, session.getId());
    }

    @Override
    protected void handleBinaryMessage(WebSocketSession session, BinaryMessage message) throws Exception {
        if (!canWrite(session) && !isReadOnlySafeMessage(message)) {
            logger.warn("Blocked document update from read-only user={} fileId={}",
                    session.getAttributes().get("username"), sessionFileMap.get(session.getId()));
            return;
        }
        broadcastBinary(session, message);
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        if (!canWrite(session)) {
            logger.warn("Blocked text message from read-only user={} fileId={}",
                    session.getAttributes().get("username"), sessionFileMap.get(session.getId()));
            return;
        }
        broadcastText(session, message);
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        Long fileId = sessionFileMap.remove(session.getId());
        if (fileId != null) {
            Set<WebSocketSession> set = fileSessions.get(fileId);
            if (set != null) {
                set.remove(session);
                if (set.isEmpty()) {
                    fileSessions.remove(fileId);
                }
            }
        }
        logger.info("WebSocket closed: {} status={}", session.getId(), status);
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) throws Exception {
        logger.warn("WebSocket transport error session={}: {}", session.getId(), exception.getMessage());
        session.close(CloseStatus.SERVER_ERROR);
    }

    private void broadcastBinary(WebSocketSession sender, BinaryMessage message) throws IOException {
        Long fileId = sessionFileMap.get(sender.getId());
        if (fileId == null) return;
        Set<WebSocketSession> peers = fileSessions.get(fileId);
        if (peers == null) return;
        java.nio.ByteBuffer buf = message.getPayload().asReadOnlyBuffer();
        byte[] payload = new byte[buf.remaining()];
        buf.get(payload);
        for (WebSocketSession session : peers) {
            if (!session.getId().equals(sender.getId()) && session.isOpen()) {
                session.sendMessage(new BinaryMessage(payload));
            }
        }
    }

    private void broadcastText(WebSocketSession sender, TextMessage message) throws IOException {
        Long fileId = sessionFileMap.get(sender.getId());
        if (fileId == null) return;
        Set<WebSocketSession> peers = fileSessions.get(fileId);
        if (peers == null) return;
        for (WebSocketSession session : peers) {
            if (!session.getId().equals(sender.getId()) && session.isOpen()) {
                session.sendMessage(message);
            }
        }
    }

    private Long extractFileId(WebSocketSession session) {
        URI uri = session.getUri();
        if (uri == null) return null;
        String path = uri.getPath();
        if (path == null || path.isEmpty()) return null;
        // strip trailing slash
        if (path.endsWith("/")) {
            path = path.substring(0, path.length() - 1);
        }
        int idx = path.lastIndexOf('/');
        if (idx < 0 || idx == path.length() - 1) return null;
        String last = path.substring(idx + 1);
        // y-websocket may connect to /ws/<room>; room is fileId string
        try {
            return Long.parseLong(last);
        } catch (NumberFormatException e) {
            // also accept query room if needed
            return null;
        }
    }

    private boolean canWrite(WebSocketSession session) {
        return Boolean.TRUE.equals(session.getAttributes().get("canWrite"));
    }

    /**
     * View-only participants may request Yjs state and publish presence, but must
     * never relay a document update. y-websocket messages use lib0 varuints:
     * sync=0 (only step1 is safe), awareness=1, query-awareness=3.
     */
    private boolean isReadOnlySafeMessage(BinaryMessage message) {
        java.nio.ByteBuffer payload = message.getPayload().asReadOnlyBuffer();
        Integer messageType = readVarUint(payload);
        if (messageType == null) {
            return false;
        }
        if (messageType == 0) {
            Integer syncType = readVarUint(payload);
            return syncType != null && syncType == 0;
        }
        return messageType == 1 || messageType == 3;
    }

    private Integer readVarUint(java.nio.ByteBuffer payload) {
        int result = 0;
        int shift = 0;
        while (payload.hasRemaining() && shift <= 28) {
            int next = payload.get() & 0xff;
            result |= (next & 0x7f) << shift;
            if ((next & 0x80) == 0) {
                return result;
            }
            shift += 7;
        }
        return null;
    }
}
