package com.opencollab.dto;

import lombok.Data;

import javax.validation.constraints.NotBlank;

@Data
public class ResetPasswordRequest {
    @NotBlank(message = "新密码不能为空")
    private String newPassword;

    public String getNewPassword() { return newPassword; }
    public void setNewPassword(String newPassword) { this.newPassword = newPassword; }
}
