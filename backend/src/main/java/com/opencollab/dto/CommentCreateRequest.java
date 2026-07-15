package com.opencollab.dto;

import lombok.Data;

import javax.validation.constraints.NotBlank;

@Data
public class CommentCreateRequest {
    private String cellRef;

    @NotBlank(message = "评论内容不能为空")
    private String content;

    public String getCellRef() { return cellRef; }
    public void setCellRef(String cellRef) { this.cellRef = cellRef; }
    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
}
