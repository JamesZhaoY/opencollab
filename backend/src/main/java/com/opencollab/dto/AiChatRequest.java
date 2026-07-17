package com.opencollab.dto;

import javax.validation.constraints.NotBlank;
import java.util.List;

public class AiChatRequest {
    /** Server-configured provider selected in the chat UI: ollama or agnes. */
    private String provider;

    /** Current file content, used as the conversation context. */
    private String context;

    /** Full conversation history (most recent last). */
    private List<ChatMessage> messages;

    public String getProvider() { return provider; }
    public void setProvider(String provider) { this.provider = provider; }
    public String getContext() { return context; }
    public void setContext(String context) { this.context = context; }
    public List<ChatMessage> getMessages() { return messages; }
    public void setMessages(List<ChatMessage> messages) { this.messages = messages; }

    public static class ChatMessage {
        @NotBlank
        private String role;
        @NotBlank
        private String content;

        public String getRole() { return role; }
        public void setRole(String role) { this.role = role; }
        public String getContent() { return content; }
        public void setContent(String content) { this.content = content; }
    }
}
