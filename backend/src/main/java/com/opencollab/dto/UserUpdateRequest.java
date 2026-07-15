package com.opencollab.dto;

import lombok.Data;
import javax.validation.constraints.Email;
import javax.validation.constraints.Size;

@Data
public class UserUpdateRequest {
    @Email(message = "邮箱格式不正确")
    private String email;
    @Size(max = 100, message = "部门名称不能超过 100 个字符")
    private String department;
    private Boolean isActive;

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getDepartment() { return department; }
    public void setDepartment(String department) { this.department = department; }
    public Boolean getIsActive() { return isActive; }
    public void setIsActive(Boolean isActive) { this.isActive = isActive; }
}
