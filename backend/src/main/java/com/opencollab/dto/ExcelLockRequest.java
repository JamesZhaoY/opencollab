package com.opencollab.dto;

import lombok.Data;

import javax.validation.constraints.Min;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;

@Data
public class ExcelLockRequest {
    @NotBlank
    private String sheetId;

    @NotNull
    @Min(0)
    private Integer row;

    @NotNull
    @Min(0)
    private Integer column;
}
