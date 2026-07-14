package com.opencollab.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

import java.io.Serializable;
import java.time.LocalDateTime;

@TableName("file_version")
public class FileVersion implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    @TableField("file_id")
    private Long fileId;

    @TableField("version")
    private Integer version;

    @TableField("ydoc_snapshot")
    private String ydocSnapshot;

    @TableField("sheet_data")
    private String sheetData;

    @TableField("content")
    private String content;

    @TableField("created_by")
    private Long createdBy;

    @TableField("created_at")
    private LocalDateTime createdAt;

    @TableField("remark")
    private String remark;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getFileId() { return fileId; }
    public void setFileId(Long fileId) { this.fileId = fileId; }
    public Integer getVersion() { return version; }
    public void setVersion(Integer version) { this.version = version; }
    public String getYdocSnapshot() { return ydocSnapshot; }
    public void setYdocSnapshot(String ydocSnapshot) { this.ydocSnapshot = ydocSnapshot; }
    public String getSheetData() { return sheetData; }
    public void setSheetData(String sheetData) { this.sheetData = sheetData; }
    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
    public Long getCreatedBy() { return createdBy; }
    public void setCreatedBy(Long createdBy) { this.createdBy = createdBy; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public String getRemark() { return remark; }
    public void setRemark(String remark) { this.remark = remark; }
}
