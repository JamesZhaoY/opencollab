package com.opencollab.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class Result<T> {
    private int code;
    private String message;
    /** FastAPI-compatible error field; mirrors message on failures. */
    private String detail;
    private T data;

    public static <T> Result<T> success() {
        return new Result<>(200, "Success", null, null);
    }

    public static <T> Result<T> success(T data) {
        return new Result<>(200, "Success", null, data);
    }

    public static <T> Result<T> failure(int code, String message) {
        return new Result<>(code, message, message, null);
    }

    // Explicit accessors (Lombok processing has been flaky in this project)
    public int getCode() { return code; }
    public void setCode(int code) { this.code = code; }
    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }
    public String getDetail() { return detail; }
    public void setDetail(String detail) { this.detail = detail; }
    public T getData() { return data; }
    public void setData(T data) { this.data = data; }
}
