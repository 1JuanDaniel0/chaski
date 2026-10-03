package pe.chasqui.signal.ws;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketHttpHeaders;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.handler.TextWebSocketHandler;

/** Cliente WebSocket real para pruebas de integración. */
class WsTestClient extends TextWebSocketHandler implements AutoCloseable {
    static final ObjectMapper M = new ObjectMapper();
    final BlockingQueue<JsonNode> inbox = new LinkedBlockingQueue<>();
    final CompletableFuture<CloseStatus> closed = new CompletableFuture<>();
    WebSocketSession session;

    static WsTestClient connect(int port, String origin, String ip) throws Exception {
        var c = new WsTestClient();
        var headers = new WebSocketHttpHeaders();
        if (origin != null) headers.setOrigin(origin);
        if (ip != null) headers.add("CF-Connecting-IP", ip);
        c.session = new StandardWebSocketClient()
                .execute(c, headers, URI.create("ws://localhost:" + port + "/ws")).get(5, TimeUnit.SECONDS);
        return c;
    }

    @Override
    protected void handleTextMessage(WebSocketSession s, TextMessage m) throws Exception {
        inbox.add(M.readTree(m.getPayload()));
    }

    @Override
    public void afterConnectionClosed(WebSocketSession s, CloseStatus status) {
        closed.complete(status);
    }

    void send(String json) throws Exception {
        session.sendMessage(new TextMessage(json));
    }

    JsonNode next() throws Exception {
        JsonNode n = inbox.poll(5, TimeUnit.SECONDS);
        if (n == null) throw new AssertionError("timeout waiting for message");
        return n;
    }

    CloseStatus awaitClose() throws Exception {
        return closed.get(5, TimeUnit.SECONDS);
    }

    @Override
    public void close() throws Exception {
        if (session.isOpen()) session.close();
    }
}
