package com.vistaar.biz.auth;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseCookie;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.util.WebUtils;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HexFormat;
import java.util.Map;
import java.util.UUID;

@Service
public class AuthService {
    private static final String COOKIE = "vistaar_session";
    private final JdbcTemplate jdbc;
    private final PasswordEncoder encoder;
    private final SecureRandom random = new SecureRandom();
    private final int sessionDays;

    public AuthService(JdbcTemplate jdbc, PasswordEncoder encoder,
                       @Value("${app.session.days:30}") int sessionDays) {
        this.jdbc = jdbc;
        this.encoder = encoder;
        this.sessionDays = sessionDays;
    }

    public Map<String, Object> signIn(String email, String password) {
        var users = jdbc.queryForList(
            "select id,name,email,password_hash,role,status from app_users where lower(email)=lower(?) limit 1",
            email.trim());
        if (users.isEmpty() || !"active".equals(users.get(0).get("status"))
                || !encoder.matches(password, String.valueOf(users.get(0).get("password_hash")))) {
            throw new IllegalArgumentException("Invalid email or password.");
        }

        var user = users.get(0);
        String token = randomToken();
        String tokenHash = sha256(token);
        Instant expires = Instant.now().plus(sessionDays, ChronoUnit.DAYS);
        jdbc.update("insert into app_sessions(user_id,token_hash,expires_at) values(?,?,?)",
                user.get("id"), tokenHash, expires);
        jdbc.update("update app_users set last_login_at=now(),updated_at=now() where id=?",
                user.get("id"));

        return Map.of(
            "id", user.get("id"),
            "name", user.get("name"),
            "email", user.get("email"),
            "role", user.get("role"),
            "cookie", ResponseCookie.from(COOKIE, token)
                    .httpOnly(true).secure(false).sameSite("Lax").path("/")
                    .maxAge(java.time.Duration.ofDays(sessionDays)).build().toString()
        );
    }

    public Map<String, Object> currentUser(HttpServletRequest request) {
        var cookie = WebUtils.getCookie(request, COOKIE);
        if (cookie == null) return null;
        String hash = sha256(cookie.getValue());
        var rows = jdbc.queryForList("""
            select u.id,u.name,u.email,u.role
            from app_sessions s join app_users u on u.id=s.user_id
            where s.token_hash=? and s.expires_at>now() and u.status='active'
              and u.role in ('admin','manager')
            limit 1
            """, hash);
        if (rows.isEmpty()) return null;
        jdbc.update("update app_sessions set last_seen_at=now() where token_hash=?", hash);
        return rows.get(0);
    }

    public String logout(HttpServletRequest request) {
        var cookie = WebUtils.getCookie(request, COOKIE);
        if (cookie != null) jdbc.update("delete from app_sessions where token_hash=?", sha256(cookie.getValue()));
        return ResponseCookie.from(COOKIE, "").httpOnly(true).secure(false).sameSite("Lax")
                .path("/").maxAge(0).build().toString();
    }

    public void ensureInternalAccounts() {
        ensureAccount("Vistaar Admin", "admin@vistaar.biz", "admin123", "admin");
        ensureAccount("Vistaar Manager", "manager@vistaar.biz", "admin123", "manager");
    }

    private void ensureAccount(String name, String email, String password, String role) {
        Integer count = jdbc.queryForObject("select count(*) from app_users where lower(email)=lower(?)", Integer.class, email);
        if (count != null && count > 0) {
            jdbc.update("update app_users set role=?,status='active',updated_at=now() where lower(email)=lower(?)", role, email);
            return;
        }
        String salt = randomToken();
        jdbc.update("""
            insert into app_users(name,email,password_hash,password_salt,role,status)
            values(?,?,?,?,?,'active')
            """, name, email.toLowerCase(), encoder.encode(password), salt, role);
    }

    private String randomToken() {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        return HexFormat.of().formatHex(bytes);
    }

    private String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("Unable to create session token.", e);
        }
    }
}