package com.opencollab.config;

import com.baomidou.mybatisplus.core.handlers.MetaObjectHandler;
import org.apache.ibatis.reflection.MetaObject;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

/**
 * 统一填充 createdAt / updatedAt 字段，替代 JPA 的 @PrePersist/@PreUpdate。
 * 实体里需用 @TableField(value = "created_at", fill = FieldFill.INSERT) 形式声明。
 */
@Component
public class TimestampMetaObjectHandler implements MetaObjectHandler {

    @Override
    public void insertFill(MetaObject metaObject) {
        LocalDateTime now = LocalDateTime.now();
        Object createdByField = metaObject.hasGetter("createdAt") ? metaObject.getValue("createdAt") : null;
        if (metaObject.hasSetter("createdAt") && createdByField == null) {
            metaObject.setValue("createdAt", now);
        }
        if (metaObject.hasSetter("updatedAt")) {
            metaObject.setValue("updatedAt", now);
        }
    }

    @Override
    public void updateFill(MetaObject metaObject) {
        if (metaObject.hasSetter("updatedAt")) {
            metaObject.setValue("updatedAt", LocalDateTime.now());
        }
    }
}
