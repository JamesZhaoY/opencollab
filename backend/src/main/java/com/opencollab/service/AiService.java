package com.opencollab.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.opencollab.dto.AiChatRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Minimal backend proxy to an OpenAI-compatible chat completions endpoint.
 * Keeps the API key server-side; the file content is injected as a system prompt.
 */
@Service
public class AiService {

    private final RestTemplate restTemplate = new RestTemplate();
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${ai.base-url:http://host.docker.internal:11434/v1/chat/completions}")
    private String baseUrl;

    @Value("${ai.api-key:}")
    private String apiKey;

    @Value("${ai.model:qwen2.5:3b}")
    private String model;

    public String chat(AiChatRequest request) {
        boolean isOpenAiHost = baseUrl != null && baseUrl.contains("openai.com");
        if (isOpenAiHost && (apiKey == null || apiKey.trim().isEmpty())) {
            throw new IllegalStateException("AI 服务未配置：请在 application.yml 或环境变量中设置 ai.api-key（使用 Ollama 等本地模型时可留空）");
        }

        List<Map<String, String>> messages = new ArrayList<>();
        Map<String, String> systemMsg = new LinkedHashMap<>();
        systemMsg.put("role", "system");
        systemMsg.put("content",
                "你是一名专业的企业办公AI助手，负责帮助用户解决办公场景中的各种问题。\n\n你的主要职责包括但不限于：\n\n【办公知识咨询】\n- Office（Word、Excel、PPT）使用技巧\n- WPS办公软件\n- Outlook、邮箱使用\n- PDF处理\n- 文档编辑、表格制作、PPT设计\n- 数据统计分析\n- 打印、扫描等办公设备使用\n\n【办公效率】\n- 编写邮件、会议纪要、工作总结\n- 周报、月报、项目计划、工作汇报\n- OKR/KPI编写、请假申请、通知公告\n- 各类公文写作\n\n【企业办公】\n- OA系统使用指导\n- ERP、CRM、MES等企业系统基础知识\n- 企业流程咨询、合同模板、制度规范解读\n- 工作流程优化建议\n\n【数据分析】\n- Excel公式、数据透视表、VBA基础\n- SQL查询、图表制作、数据统计分析\n\n【AI办公】\n- AI办公工具使用、Prompt编写\n- 自动化办公建议、文档优化\n\n回答要求：\n1. 优先提供准确、专业、易理解的回答。\n2. 对于操作类问题，尽量分步骤说明。\n3. 对于Excel、Word、PPT等问题，尽量给出具体示例。\n4. 对于文案类问题，直接输出可复制使用的内容。\n5. 如果问题信息不足，应主动询问用户补充必要信息。\n6. 不编造不存在的企业制度、流程或数据。\n7. 如果涉及法律、财务、医疗等专业领域，仅提供一般性参考，建议咨询专业人士。\n\n如果用户的问题不是办公相关（例如娱乐、政治、游戏、闲聊等），请礼貌回复：\n\"我是企业办公AI助手，主要负责办公知识、办公软件、文档写作、数据分析、企业办公流程等相关问题。如有办公方面的问题，我很乐意帮助您。\"\n\n保持回答专业、简洁、高效。"
                        + (request.getContext() != null && !request.getContext().trim().isEmpty()
                            ? "\n\n当前文件内容如下：\n" + request.getContext() : ""));
        messages.add(systemMsg);
        if (request.getMessages() != null) {
            for (AiChatRequest.ChatMessage m : request.getMessages()) {
                Map<String, String> msg = new LinkedHashMap<>();
                msg.put("role", m.getRole());
                msg.put("content", m.getContent());
                messages.add(msg);
            }
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", model);
        body.put("messages", messages);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        if (apiKey != null && !apiKey.trim().isEmpty()) {
            headers.setBearerAuth(apiKey);
        }
        HttpEntity<String> entity;
        try {
            entity = new HttpEntity<>(objectMapper.writeValueAsString(body), headers);
        } catch (Exception e) {
            throw new IllegalStateException("序列化请求失败", e);
        }

        String response = restTemplate.postForObject(baseUrl, entity, String.class);
        try {
            JsonNode root = objectMapper.readTree(response);
            JsonNode content = root.path("choices").path(0).path("message").path("content");
            if (!content.isMissingNode()) {
                return content.asText();
            }
            if (root.path("error") != null) {
                throw new IllegalStateException("AI 接口返回错误：" + root.path("error").path("message").asText());
            }
            throw new IllegalStateException("AI 接口返回格式无法解析");
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("解析 AI 响应失败", e);
        }
    }
}
