CREATE TABLE IF NOT EXISTS users (
    id              BIGINT PRIMARY KEY AUTO_INCREMENT,
    username        VARCHAR(128) NOT NULL,
    email           VARCHAR(255) NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    role            VARCHAR(32)  NOT NULL DEFAULT 'user',
    department      VARCHAR(128) NULL,
    is_active       TINYINT(1)   NOT NULL DEFAULT 1,
    created_at      DATETIME     NULL,
    updated_at      DATETIME     NULL,
    UNIQUE KEY uk_users_username (username),
    UNIQUE KEY uk_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS files (
    id                BIGINT PRIMARY KEY AUTO_INCREMENT,
    name              VARCHAR(255) NOT NULL,
    description       VARCHAR(512) NULL,
    owner_id          BIGINT       NOT NULL,
    document_type     VARCHAR(32)  NULL,
    ydoc_snapshot     LONGTEXT     NULL,
    sheet_data        LONGTEXT     NULL,
    content           LONGTEXT     NULL,
    last_modified_by  BIGINT       NULL,
    created_at        DATETIME     NULL,
    updated_at        DATETIME     NULL,
    is_deleted        TINYINT(1)   NOT NULL DEFAULT 0,
    INDEX idx_files_owner_deleted (owner_id, is_deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS file_permissions (
    id          BIGINT PRIMARY KEY AUTO_INCREMENT,
    file_id     BIGINT      NOT NULL,
    user_id     BIGINT      NOT NULL,
    permission  VARCHAR(16) NOT NULL,
    granted_by  BIGINT      NULL,
    created_at  DATETIME    NULL,
    UNIQUE KEY uk_file_user (file_id, user_id),
    INDEX idx_perm_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS file_version (
    id             BIGINT PRIMARY KEY AUTO_INCREMENT,
    file_id        BIGINT   NOT NULL,
    version        INT      NOT NULL,
    ydoc_snapshot  LONGTEXT NULL,
    sheet_data     LONGTEXT NULL,
    content        LONGTEXT NULL,
    created_by     BIGINT   NULL,
    created_at     DATETIME NULL,
    remark         VARCHAR(512) NULL,
    INDEX idx_version_file (file_id, version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS comments (
    id           BIGINT PRIMARY KEY AUTO_INCREMENT,
    file_id      BIGINT       NOT NULL,
    user_id      BIGINT       NOT NULL,
    cell_ref     VARCHAR(64)  NULL,
    content      TEXT         NOT NULL,
    is_resolved  TINYINT(1)   NOT NULL DEFAULT 0,
    created_at   DATETIME     NULL,
    updated_at   DATETIME     NULL,
    INDEX idx_comments_file (file_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
