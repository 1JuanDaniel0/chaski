package pe.chasqui.signal.ws;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "management.server.port=0",
        "chasqui.join-per-ip-per-minute=2",
        "chasqui.messages-per-second=5"})
class RateLimitIntegrationTest {
    @LocalServerPort int port;

    static String join(int i) {
        return "{\"type\":\"join\",\"roomId\":\"" + String.format("%022d", i) + "\",\"v\":1}";
    }

    @Test
    void joinPerIpIsLimitedUsingCfHeader() throws Exception {
        String ip = "203.0.113.7";
        for (int i = 0; i < 2; i++) {
            try (var c = WsTestClient.connect(port, "http://localhost:5173", ip)) {
                c.send(join(i));
                assertEquals("joined", c.next().get("type").asText());
            }
        }
        try (var c = WsTestClient.connect(port, "http://localhost:5173", ip)) {
            c.send(join(3));
            assertEquals("rate-limited", c.next().get("code").asText());
            c.awaitClose();
        }
        // otra IP no se ve afectada
        try (var c = WsTestClient.connect(port, "http://localhost:5173", "203.0.113.8")) {
            c.send(join(4));
            assertEquals("joined", c.next().get("type").asText());
        }
    }

    @Test
    void messageFloodIsRateLimited() throws Exception {
        try (var c = WsTestClient.connect(port, "http://localhost:5173", "198.51.100.1")) {
            for (int i = 0; i < 30; i++) c.send("{\"type\":\"ping\"}");
            boolean limited = false;
            for (int i = 0; i < 40 && !limited; i++) {
                var n = c.inbox.poll(2, java.util.concurrent.TimeUnit.SECONDS);
                if (n == null) break;
                limited = n.has("code") && n.get("code").asText().equals("rate-limited");
            }
            assertTrue(limited);
            c.awaitClose();
        }
    }
}
