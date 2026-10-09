package pe.chasqui.signal.ws;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.concurrent.ExecutionException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.web.socket.CloseStatus;
import pe.chasqui.signal.room.RoomRegistry;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "management.server.port=0",
        "chasqui.join-per-ip-per-minute=1000",
        "chasqui.turn.secret=test-secret",
        "chasqui.turn.urls=turn:turn.example:3478,turns:turn.example:5349"})
class SignalIntegrationTest {
    static final String ORIGIN = "http://localhost:5173";

    @LocalServerPort int port;
    @Autowired RoomRegistry registry;

    static String newRoom() {
        byte[] b = new byte[16];
        new SecureRandom().nextBytes(b);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(b);
    }

    static String join(String room) {
        return "{\"type\":\"join\",\"roomId\":\"" + room + "\",\"v\":1}";
    }

    WsTestClient client() throws Exception {
        return WsTestClient.connect(port, ORIGIN, null);
    }

    @Test
    void joinProducesJoinedAndPeerJoined() throws Exception {
        String room = newRoom();
        try (var a = client(); var b = client()) {
            a.send(join(room));
            JsonNode ja = a.next();
            assertEquals("joined", ja.get("type").asText());
            assertEquals(0, ja.get("peers").size());
            assertEquals(11, ja.get("peerId").asText().length());
            JsonNode turn = ja.get("turn");
            assertEquals(3600, turn.get("ttl").asInt());
            assertEquals(2, turn.get("urls").size());
            assertTrue(turn.get("username").asText().matches("\\d+:[A-Za-z0-9_-]{11}"));
            assertFalse(turn.get("credential").asText().isEmpty());

            b.send(join(room));
            JsonNode jb = b.next();
            assertEquals(ja.get("peerId").asText(), jb.get("peers").get(0).asText());
            JsonNode pj = a.next();
            assertEquals("peer-joined", pj.get("type").asText());
            assertEquals(jb.get("peerId").asText(), pj.get("peerId").asText());
        }
    }

    @Test
    void signalIsForwardedWithFromSeqAndData() throws Exception {
        String room = newRoom();
        try (var a = client(); var b = client()) {
            a.send(join(room));
            String idA = a.next().get("peerId").asText();
            b.send(join(room));
            String idB = b.next().get("peerId").asText();
            a.next(); // peer-joined
            a.send("{\"type\":\"signal\",\"to\":\"" + idB + "\",\"seq\":42,\"data\":\"aXYtY2lwaGVy\"}");
            JsonNode s = b.next();
            assertEquals("signal", s.get("type").asText());
            assertEquals(idA, s.get("from").asText());
            assertEquals(42, s.get("seq").asInt());
            assertEquals("aXYtY2lwaGVy", s.get("data").asText());
            assertFalse(s.has("to"));
        }
    }

    @Test
    void thirdPeerGetsRoomFullAndIsClosed() throws Exception {
        String room = newRoom();
        try (var a = client(); var b = client(); var c = client()) {
            a.send(join(room));
            a.next();
            b.send(join(room));
            b.next();
            c.send(join(room));
            JsonNode e = c.next();
            assertEquals("error", e.get("type").asText());
            assertEquals("room-full", e.get("code").asText());
            assertEquals(CloseStatus.POLICY_VIOLATION.getCode(), c.awaitClose().getCode());
        }
    }

    @Test
    void badOriginIsRejected() {
        var ex = assertThrows(ExecutionException.class, () -> WsTestClient.connect(port, "https://evil.example", null));
        assertTrue(ex.getCause().getMessage().contains("403") || ex.getCause().toString().contains("403"), ex.getCause().toString());
        assertThrows(ExecutionException.class, () -> WsTestClient.connect(port, null, null));
    }

    @Test
    void tooLargeFrameGetsErrorAndClose() throws Exception {
        try (var a = client()) {
            a.send("{\"type\":\"ping\",\"pad\":\"" + "x".repeat(70 * 1024) + "\"}");
            JsonNode e = a.next();
            assertEquals("too-large", e.get("code").asText());
            assertEquals(CloseStatus.TOO_BIG_TO_PROCESS.getCode(), a.awaitClose().getCode());
        }
    }

    @Test
    void kickByOwnerAndForbiddenForNonOwner() throws Exception {
        String room = newRoom();
        try (var a = client(); var b = client()) {
            a.send(join(room));
            String idA = a.next().get("peerId").asText();
            b.send(join(room));
            String idB = b.next().get("peerId").asText();
            a.next(); // peer-joined

            b.send("{\"type\":\"kick\",\"peerId\":\"" + idA + "\"}");
            JsonNode f = b.next();
            assertEquals("forbidden", f.path("code").asText(), f.toString());
            assertTrue(b.session.isOpen());

            a.send("{\"type\":\"kick\",\"peerId\":\"" + idB + "\"}");
            assertEquals("kicked", b.next().get("type").asText());
            b.awaitClose();
            JsonNode left = a.next();
            assertEquals("peer-left", left.get("type").asText());
            assertEquals(idB, left.get("peerId").asText());
        }
    }

    @Test
    void peerLeftOnClose() throws Exception {
        String room = newRoom();
        try (var a = client(); var b = client()) {
            a.send(join(room));
            a.next();
            b.send(join(room));
            String idB = b.next().get("peerId").asText();
            a.next();
            b.session.close();
            JsonNode left = a.next();
            assertEquals("peer-left", left.get("type").asText());
            assertEquals(idB, left.get("peerId").asText());
        }
    }

    @Test
    void protocolErrorsKeepSocketOpen() throws Exception {
        try (var a = client()) {
            a.send("{\"type\":\"signal\",\"to\":\"x\",\"seq\":1,\"data\":\"y\"}");
            assertEquals("not-in-room", a.next().get("code").asText());
            a.send("garbage");
            assertEquals("bad-message", a.next().get("code").asText());
            a.send("{\"type\":\"ping\"}");
            assertEquals("pong", a.next().get("type").asText());
            a.send(join(newRoom()));
            assertEquals("joined", a.next().get("type").asText());
            a.send(join(newRoom()));
            assertEquals("not-in-room", a.next().get("code").asText());
            a.send("{\"type\":\"signal\",\"to\":\"ghost\",\"seq\":1,\"data\":\"y\"}");
            assertEquals("unknown-peer", a.next().get("code").asText());
            assertTrue(a.session.isOpen());
        }
    }

    @Test
    void unsupportedVersionClosesSocket() throws Exception {
        try (var a = client()) {
            a.send("{\"type\":\"join\",\"roomId\":\"" + newRoom() + "\",\"v\":2}");
            assertEquals("unsupported-version", a.next().get("code").asText());
            a.awaitClose();
        }
    }

    @Test
    void resumeTakesOverStaleSocketSilently() throws Exception {
        String room = newRoom();
        String token = newRoom();
        String resume = "{\"type\":\"join\",\"roomId\":\"" + room + "\",\"v\":1,\"resume\":\"" + token + "\"}";
        try (var a = client(); var b = client(); var a2 = client()) {
            a.send(resume);
            String idA = a.next().get("peerId").asText();
            b.send(join(room));
            String idB = b.next().get("peerId").asText();
            b.send(join(room).replace("join", "ping"));
            a.next(); // peer-joined

            a2.send(resume);
            JsonNode j = a2.next();
            assertEquals("joined", j.get("type").asText());
            assertEquals(idA, j.get("peerId").asText());
            assertEquals(idB, j.get("peers").get(0).asText());
            assertEquals(RoomRegistry.CLOSE_REPLACED, a.awaitClose().getCode());

            // b solo recibe su pong: ni peer-left ni peer-joined.
            assertEquals("pong", b.next().get("type").asText());
            b.send("{\"type\":\"signal\",\"to\":\"" + idA + "\",\"seq\":1,\"data\":\"eA\"}");
            assertEquals("signal", a2.next().get("type").asText());
            assertTrue(b.inbox.isEmpty(), b.inbox.toString());
        }
    }
}
