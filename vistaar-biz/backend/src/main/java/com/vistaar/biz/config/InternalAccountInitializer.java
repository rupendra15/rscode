package com.vistaar.biz.config;

import com.vistaar.biz.auth.AuthService;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class InternalAccountInitializer {
    @Bean
    CommandLineRunner createInternalAccounts(AuthService authService) {
        return args -> authService.ensureInternalAccounts();
    }
}