package com.opencollab.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.opencollab.dto.AiChatRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Proxy for an OpenAI-compatible chat completions endpoint. The stream method
 * relays SSE bytes directly so the browser receives each provider chunk promptly.
 */
@Service
public class AiService {

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${ai.ollama.base-url:http://host.docker.internal:11434/v1/chat/completions}")
    private String ollamaBaseUrl;

    @Value("${ai.ollama.api-key:}")
    private String ollamaApiKey;

    @Value("${ai.ollama.model:qwen2.5:3b}")
    private String ollamaModel;

    @Value("${ai.agnes.base-url:https://apihub.agnes-ai.com/v1/chat/completions}")
    private String agnesBaseUrl;

    @Value("${ai.agnes.api-key:}")
    private String agnesApiKey;

    @Value("${ai.agnes.model:agnes-2.0-flash}")
    private String agnesModel;

    public AiService() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(15_000);
        // Read timeout is intentionally much longer than the connection timeout:
        // a reasoning model can take a while before emitting its first SSE token.
        factory.setReadTimeout(10 * 60 * 1000);
        this.restTemplate = new RestTemplate(factory);
    }

    public String chat(AiChatRequest request) {
        ProviderConfig provider = providerFor(request.getProvider());
        String response = restTemplate.postForObject(provider.baseUrl, createRequest(request, false, provider), String.class);
        try {
            JsonNode root = objectMapper.readTree(response);
            JsonNode content = root.path("choices").path(0).path("message").path("content");
            if (!content.isMissingNode()) return content.asText();
            if (!root.path("error").isMissingNode()) {
                throw new IllegalStateException("AI 接口返回错误：" + root.path("error").path("message").asText());
            }
            throw new IllegalStateException("AI 接口返回格式无法解析");
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("解析 AI 响应失败", e);
        }
    }

    public void stream(AiChatRequest request, OutputStream output) throws IOException {
        ProviderConfig provider = providerFor(request.getProvider());
        HttpEntity<String> entity = createRequest(request, true, provider);
        try {
            // Start the SSE response immediately so proxies do not classify a
            // model's initial reasoning delay as an idle upstream connection.
            output.write("event: ready\ndata: {\"choices\":[]}\n\n".getBytes(StandardCharsets.UTF_8));
            output.flush();
            restTemplate.execute(provider.baseUrl, HttpMethod.POST,
                    clientRequest -> {
                        clientRequest.getHeaders().putAll(entity.getHeaders());
                        if (entity.getBody() != null) {
                            clientRequest.getBody().write(entity.getBody().getBytes(StandardCharsets.UTF_8));
                        }
                    },
                    clientResponse -> {
                        try (InputStream input = clientResponse.getBody()) {
                            byte[] buffer = new byte[4096];
                            int count;
                            while ((count = input.read(buffer)) != -1) {
                                output.write(buffer, 0, count);
                                output.flush();
                            }
                        }
                        return null;
                    });
        } catch (RestClientException e) {
            writeStreamError(output, "AI 服务请求失败：" + e.getMessage());
        }
    }

    private HttpEntity<String> createRequest(AiChatRequest request, boolean stream, ProviderConfig provider) {
        if (provider.requiresApiKey && (provider.apiKey == null || provider.apiKey.trim().isEmpty())) {
            throw new IllegalStateException("Agnes AI 服务未配置：请设置 AGNES_API_KEY");
        }

        List<Map<String, String>> messages = new ArrayList<>();
        Map<String, String> systemMsg = new LinkedHashMap<>();
        systemMsg.put("role", "system");
        systemMsg.put("content", "你是一名专业的企业办公AI助手，负责帮助用户解决办公场景中的各种问题。\n\n你的主要职责包括但不限于：\n\n【办公知识咨询】\n- Office（Word、Excel、PPT）使用技巧\n- WPS办公软件\n- Outlook、邮箱使用\n- PDF处理\n- 文档编辑、表格制作、PPT设计\n- 数据统计分析\n- 打印、扫描等办公设备使用\n\n【办公效率】\n- 编写邮件、会议纪要、工作总结\n- 周报、月报、项目计划、工作汇报\n- OKR/KPI编写、请假申请、通知公告\n- 各类公文写作\n\n【企业办公】\n- OA系统使用指导\n- ERP、CRM、MES等企业系统基础知识\n- 企业流程咨询、合同模板、制度规范解读\n- 工作流程优化建议\n\n【数据分析】\n- Excel公式、数据透视表、VBA基础\n- SQL查询、图表制作、数据统计分析\n\n【AI办公】\n- AI办公工具使用、Prompt编写\n- 自动化办公建议、文档优化\n\n回答要求：\n1. 优先提供准确、专业、易理解的回答。\n2. 对于操作类问题，尽量分步骤说明。\n3. 对于Excel、Word、PPT等问题，尽量给出具体示例。\n4. 对于文案类问题，直接输出可复制使用的内容。\n5. 如果问题信息不足，应主动询问用户补充必要信息。\n6. 不编造不存在的企业制度、流程或数据。\n7. 如果涉及法律、财务、医疗等专业领域，仅提供一般性参考，建议咨询专业人士。\n\n如果用户的问题不是办公相关（例如娱乐、政治、游戏、闲聊等），请礼貌回复：\n\"我是企业办公AI助手，主要负责办公知识、办公软件、文档写作、数据分析、企业办公流程等相关问题。如有办公方面的问题，我很乐意帮助您。\"\n\n保持回答专业、简洁、高效。"
                + (request.getContext() != null && !request.getContext().trim().isEmpty()
                    ? "\n\n当前文件内容如下：\n" + request.getContext() : ""));
        messages.add(systemMsg);
        if (request.getMessages() != null) {
            for (AiChatRequest.ChatMessage message : request.getMessages()) {
                Map<String, String> item = new LinkedHashMap<>();
                item.put("role", message.getRole());
                item.put("content", message.getContent());
                messages.add(item);
            }
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", provider.model);
        body.put("messages", messages);
        if (stream) body.put("stream", true);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        if (provider.apiKey != null && !provider.apiKey.trim().isEmpty()) headers.setBearerAuth(provider.apiKey);
        try {
            return new HttpEntity<>(objectMapper.writeValueAsString(body), headers);
        } catch (Exception e) {
            throw new IllegalStateException("序列化请求失败", e);
        }
    }

    private ProviderConfig providerFor(String selected) {
        if (selected == null || selected.trim().isEmpty() || "agnes".equalsIgnoreCase(selected)) {
            return new ProviderConfig(agnesBaseUrl, agnesApiKey, agnesModel, true);
        }
        if ("ollama".equalsIgnoreCase(selected)) {
            return new ProviderConfig(ollamaBaseUrl, ollamaApiKey, ollamaModel, false);
        }
        throw new IllegalArgumentException("不支持的 AI 服务提供方");
    }

    private static class ProviderConfig {
        private final String baseUrl;
        private final String apiKey;
        private final String model;
        private final boolean requiresApiKey;

        private ProviderConfig(String baseUrl, String apiKey, String model, boolean requiresApiKey) {
            this.baseUrl = baseUrl;
            this.apiKey = apiKey;
            this.model = model;
            this.requiresApiKey = requiresApiKey;
        }
    }

    private void writeStreamError(OutputStream output, String message) throws IOException {
        try {
            Map<String, String> error = new LinkedHashMap<>();
            error.put("message", message);
            output.write(("event: error\ndata: " + objectMapper.writeValueAsString(error) + "\n\n").getBytes(StandardCharsets.UTF_8));
            output.flush();
        } catch (Exception e) {
            throw new IOException("写入 AI 流错误信息失败", e);
        }
    }
}
