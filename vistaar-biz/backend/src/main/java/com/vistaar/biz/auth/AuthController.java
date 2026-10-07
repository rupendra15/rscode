package com.vistaar.biz.auth;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final AuthService auth;

    public AuthController(AuthService auth) {
        this.auth = auth;
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody LoginRequest request) {
        try {
            var result = auth.signIn(request.email(), request.password());
            String cookie = String.valueOf(result.get("cookie"));
            return ResponseEntity.ok()
                    .header(HttpHeaders.SET_COOKIE, cookie)
                    .body(Map.of("ok", true, "role", result.get("role")));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(401).body(Map.of("ok", false, "error", e.getMessage()));
        }
    }

    @GetMapping("/me")
    public ResponseEntity<?> me(HttpServletRequest request) {
        var user = auth.currentUser(request);
        return user == null
                ? ResponseEntity.status(401).body(Map.of("ok", false))
                : ResponseEntity.ok(Map.of("ok", true, "user", user));
    }

    @PostMapping("/logout")
    public ResponseEntity<?> logout(HttpServletRequest request) {
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, auth.logout(request))
                .body(Map.of("ok", true));
    }

    public record LoginRequest(String email, String password) {}
}