# Build stage
FROM maven:3.9-eclipse-temurin-8 AS build
WORKDIR /app
COPY pom.xml .
COPY src ./src
RUN mvn -q -DskipTests package

# Runtime stage
FROM eclipse-temurin:8-jre
WORKDIR /app
COPY --from=build /app/target/opencollab-backend-*.jar /app/app.jar
RUN mkdir -p /app/uploads
ENV UPLOAD_DIR=/app/uploads
EXPOSE 8000
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
