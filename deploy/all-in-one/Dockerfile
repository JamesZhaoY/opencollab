# Build the web application once, then package every runtime in one deployable image.
FROM node:20-alpine AS frontend-build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM maven:3.9-eclipse-temurin-8 AS backend-build
WORKDIR /app
COPY backend/pom.xml ./
COPY backend/src ./src
RUN mvn -q -DskipTests package

FROM ubuntu:22.04
ENV DEBIAN_FRONTEND=noninteractive \
    TZ=Asia/Shanghai \
    DB_HOST=127.0.0.1 \
    DB_PORT=3306 \
    DB_NAME=excel_collab \
    DB_USER=opencollab \
    REDIS_HOST=127.0.0.1 \
    REDIS_PORT=6379 \
    UPLOAD_DIR=/app/uploads \
    APP_ALLOWED_ORIGINS=http://localhost \
    JAVA_TOOL_OPTIONS=-Duser.timezone=Asia/Shanghai

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       ca-certificates curl nginx mysql-server redis-server supervisor tzdata openjdk-17-jre-headless \
    && rm -rf /var/lib/apt/lists/* \
    && rm -f /etc/nginx/sites-enabled/default \
    && mkdir -p /app/uploads /var/run/mysqld \
    && chown -R mysql:mysql /var/lib/mysql /var/run/mysqld \
    && chown -R redis:redis /var/lib/redis

COPY --from=backend-build /app/target/opencollab-backend-*.jar /app/app.jar
COPY --from=frontend-build /app/dist/ /usr/share/nginx/html/
COPY deploy/all-in-one/supervisord.conf /etc/supervisor/conf.d/opencollab.conf
COPY deploy/all-in-one/nginx.conf /etc/nginx/conf.d/opencollab.conf
COPY deploy/all-in-one/entrypoint.sh /usr/local/bin/opencollab-entrypoint
RUN chmod +x /usr/local/bin/opencollab-entrypoint

EXPOSE 80
VOLUME ["/var/lib/mysql", "/var/lib/redis", "/app/uploads"]
ENTRYPOINT ["/usr/local/bin/opencollab-entrypoint"]
