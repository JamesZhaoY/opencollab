package com.opencollab.dto;

import lombok.Data;

import javax.validation.constraints.NotBlank;

@Data
public class ResetPasswordRequest {
    @NotBlank(message = "New password is required")
    private String newPassword;

    public String getNewPassword() { return newPassword; }
    public void setNewPassword(String newPassword) { this.newPassword = newPassword; }
}
