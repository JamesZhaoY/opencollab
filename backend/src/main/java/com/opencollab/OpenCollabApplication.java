package com.opencollab;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.security.config.annotation.method.configuration.EnableGlobalMethodSecurity;

import java.util.concurrent.Executor;

@MapperScan("com.opencollab.mapper")
@SpringBootApplication
@EnableAsync
@EnableGlobalMethodSecurity(prePostEnabled = true)
public class OpenCollabApplication {

    public static void main(String[] args) {
        SpringApplication.run(OpenCollabApplication.class, args);
    }

    @Bean(name = "taskExecutor")
    public Executor taskExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(5);
        executor.setMaxPoolSize(10);
        executor.setQueueCapacity(100);
        executor.setThreadNamePrefix("collab-async-");
        executor.initialize();
        return executor;
    }
}