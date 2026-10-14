package pe.chasqui.signal.turn;

import static org.junit.jupiter.api.Assertions.*;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.Test;
import pe.chasqui.signal.config.ChasquiProperties;

class TurnCredentialsTest {
    private static TurnCredentials make(String secret, List<String> urls) {
        var props = new ChasquiProperties(List.of(), 65536, 2, 10, 20, null, null, 1000,
                new ChasquiProperties.Turn(secret, urls, 3600, 2));
        return new TurnCredentials(props, Clock.fixed(Instant.ofEpochSecond(1_700_000_000L), ZoneOffset.UTC));
    }

    @Test
    void matchesRfc2202HmacSha1Vector() {
        // RFC 2202, caso 2: key="Jefe", data="what do ya want for nothing?"
        byte[] expected = HexFormat.of().parseHex("effcdf6ae5eb2fa2d27416d5f184df9c259a7c79");
        assertEquals(Base64.getEncoder().encodeToString(expected),
                make("Jefe", List.of("turn:x")).credentialFor("what do ya want for nothing?"));
    }

    @Test
    void issuedCredentialsFollowRestApiScheme() throws Exception {
        var info = make("s3cr3t", List.of("turn:t.example:3478", "turns:t.example:5349")).issue("1.2.3.4").orElseThrow();
        assertEquals(3600, info.ttl());
        assertEquals(List.of("turn:t.example:3478", "turns:t.example:5349"), info.urls());
        String[] parts = info.username().split(":");
        assertEquals(2, parts.length);
        assertEquals("1700003600", parts[0]);
        assertEquals(8, Base64.getUrlDecoder().decode(parts[1]).length);
        Mac mac = Mac.getInstance("HmacSHA1");
        mac.init(new SecretKeySpec("s3cr3t".getBytes(StandardCharsets.UTF_8), "HmacSHA1"));
        String expected = Base64.getEncoder().encodeToString(mac.doFinal(info.username().getBytes(StandardCharsets.UTF_8)));
        assertEquals(expected, info.credential());
    }

    @Test
    void limitsCredentialsPerIpPerDay() {
        var t = make("s3cr3t", List.of("turn:x"));
        assertTrue(t.issue("1.2.3.4").isPresent());
        assertTrue(t.issue("1.2.3.4").isPresent());
        assertTrue(t.issue("1.2.3.4").isEmpty());
        assertTrue(t.issue("5.6.7.8").isPresent());
    }

    @Test
    void usernameFormat() {
        assertEquals("1700003600:AAECAwQFBgc", TurnCredentials.username(1_700_003_600L, new byte[] {0, 1, 2, 3, 4, 5, 6, 7}));
    }

    @Test
    void omittedWithoutSecretOrUrls() {
        assertTrue(make("", List.of("turn:x")).issue("1.2.3.4").isEmpty());
        assertTrue(make(null, List.of("turn:x")).issue("1.2.3.4").isEmpty());
        assertTrue(make("s", List.of()).issue("1.2.3.4").isEmpty());
    }
}
