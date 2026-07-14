package com.opencollab.dto;

import lombok.Data;
import javax.validation.constraints.NotBlank;

@Data
public class RefreshTokenRequest {
    @NotBlank(message = "Refresh token is required")
    private String refreshToken;

    public String getRefreshToken() { return refreshToken; }
    public void setRefreshToken(String refreshToken) { this.refreshToken = refreshToken; }
}
