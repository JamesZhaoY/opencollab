package com.opencollab.dto;

import lombok.Data;
import javax.validation.constraints.NotBlank;

@Data
public class RefreshTokenRequest {
    @NotBlank(message = "登录状态不能为空")
    private String refreshToken;

    public String getRefreshToken() { return refreshToken; }
    public void setRefreshToken(String refreshToken) { this.refreshToken = refreshToken; }
}
