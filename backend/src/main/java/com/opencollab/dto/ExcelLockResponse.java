package com.opencollab.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ExcelLockResponse {
    private boolean acquired;
    private String ownerUsername;
}
