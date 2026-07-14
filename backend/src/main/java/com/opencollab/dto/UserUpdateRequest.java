package com.opencollab.dto;

import lombok.Data;
import javax.validation.constraints.Email;
import javax.validation.constraints.Size;

@Data
public class UserUpdateRequest {
    @Email(message = "Email should be valid")
    private String email;
    @Size(max = 100, message = "Department must be less than 100 characters")
    private String department;
    private Boolean isActive;
}