package pe.chasqui.signal.ws;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "management.server.port=0",
        "chasqui.join-per-ip-per-minute=1000"})
class CodeIntegrationTest {
    static final String ORIGIN = "http://localhost:5173";
    static final String OPEN = "{\"type\":\"code-open\",\"v\":1}";

    @LocalServerPort int port;

    WsTestClient client() throws Exception {
        return WsTestClient.connect(port, ORIGIN, null);
    }

    static String codeJoin(String slot) {
        return "{\"type\":\"code-join\",\"v\":1,\"slot\":\"" + slot + "\"}";
    }

    static String pake(String data) {
        return "{\"type\":\"pake\",\"data\":\"" + data + "\"}";
    }

    @Test
    void codeFlowRelaysPakeAndClosesTogether() throws Exception {
        try (var host = client(); var guest = client(); var late = client()) {
            host.send(OPEN);
            JsonNode code = host.next();
            assertEquals("code", code.get("type").asText());
            String slot = code.get("slot").asText();
            assertTrue(slot.matches("\\d{2}"));
            assertEquals(120, code.get("ttl").asInt());

            guest.send(codeJoin(slot));
            JsonNode pg = guest.next();
            JsonNode ph = host.next();
            assertEquals("code-paired", pg.get("type").asText());
            assertEquals(22, pg.get("sid").asText().length());
            assertEquals(pg, ph);

            host.send(pake("Ya"));
            assertEquals("Ya", guest.next().get("data").asText());
            guest.send(pake("Yb_Tb"));
            assertEquals("Yb_Tb", host.next().get("data").asText());

            late.send(codeJoin(slot));
            assertEquals("bad-code", late.next().get("code").asText());
            late.awaitClose();

            guest.close();
            assertEquals(4002, host.awaitClose().getCode());
        }
    }

    @Test
    void unknownCodeIsRejectedAndClosed() throws Exception {
        try (var host = client(); var guest = client()) {
            host.send(OPEN);
            String slot = host.next().get("slot").asText();
            String other = slot.equals("00") ? "01" : "00";
            guest.send(codeJoin(other));
            assertEquals("bad-code", guest.next().get("code").asText());
            guest.awaitClose();
        }
    }

    @Test
    void codeSocketCannotJoinARoomNorRelayBeforePairing() throws Exception {
        try (var host = client(); var roomer = client()) {
            host.send(pake("AAAA"));
            assertEquals("not-in-room", host.next().get("code").asText());
            host.send(OPEN);
            host.next();
            host.send(pake("AAAA"));
            assertEquals("not-in-room", host.next().get("code").asText());
            host.send("{\"type\":\"join\",\"roomId\":\"AAAAAAAAAAAAAAAAAAAAAA\",\"v\":1}");
            assertEquals("not-in-room", host.next().get("code").asText());

            roomer.send("{\"type\":\"join\",\"roomId\":\"BBBBBBBBBBBBBBBBBBBBBB\",\"v\":1}");
            assertEquals("joined", roomer.next().get("type").asText());
            roomer.send(OPEN);
            assertEquals("not-in-room", roomer.next().get("code").asText());
        }
    }

    @Test
    void invalidCodeMessagesAreBadMessages() throws Exception {
        try (var c = client()) {
            c.send(codeJoin("123"));
            assertEquals("bad-message", c.next().get("code").asText());
            c.send(pake("no válido"));
            assertEquals("bad-message", c.next().get("code").asText());
            c.send("{\"type\":\"code-open\",\"v\":2}");
            assertEquals("unsupported-version", c.next().get("code").asText());
        }
    }
}
