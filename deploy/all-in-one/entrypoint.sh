#!/usr/bin/env bash
set -euo pipefail

: "${MYSQL_ROOT_PASSWORD:?必须设置 MYSQL_ROOT_PASSWORD}"
: "${DB_PASSWORD:?必须设置 DB_PASSWORD}"
: "${REDIS_PASSWORD:?必须设置 REDIS_PASSWORD}"
: "${JWT_SECRET:?必须设置 JWT_SECRET}"

case "$DB_NAME" in
  *[!a-zA-Z0-9_]* | '')
    echo 'DB_NAME 只能包含字母、数字和下划线' >&2
    exit 1
    ;;
esac

escape_sql() {
  printf '%s' "$1" | sed "s/'/''/g"
}

mkdir -p /var/run/mysqld /app/uploads /var/lib/redis
chown -R mysql:mysql /var/run/mysqld /var/lib/mysql
chown -R redis:redis /var/lib/redis

# Initialise the embedded database only when its persistent volume is empty.
if [ ! -d /var/lib/mysql/mysql ]; then
  echo 'Initializing embedded MySQL data directory...'
  mysqld --initialize-insecure --user=mysql
  mysqld --user=mysql --skip-networking --socket=/var/run/mysqld/bootstrap.sock &
  bootstrap_pid=$!
  until mysqladmin --socket=/var/run/mysqld/bootstrap.sock -uroot ping --silent; do sleep 1; done

  root_password=$(escape_sql "$MYSQL_ROOT_PASSWORD")
  database_name=$(escape_sql "$DB_NAME")
  database_user=$(escape_sql "$DB_USER")
  database_password=$(escape_sql "$DB_PASSWORD")
  mysql --socket=/var/run/mysqld/bootstrap.sock -uroot <<SQL
ALTER USER 'root'@'localhost' IDENTIFIED BY '${root_password}';
CREATE DATABASE IF NOT EXISTS \`${database_name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${database_user}'@'%' IDENTIFIED BY '${database_password}';
GRANT ALL PRIVILEGES ON \`${database_name}\`.* TO '${database_user}'@'%';
FLUSH PRIVILEGES;
SQL
  mysqladmin --socket=/var/run/mysqld/bootstrap.sock -uroot -p"$MYSQL_ROOT_PASSWORD" shutdown
  wait "$bootstrap_pid" || true
fi

exec /usr/bin/supervisord -n -c /etc/supervisor/supervisord.conf
