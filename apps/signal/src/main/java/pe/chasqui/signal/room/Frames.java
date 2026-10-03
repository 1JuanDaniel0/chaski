package pe.chasqui.signal.room;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.List;
import java.util.Optional;
import pe.chasqui.signal.turn.TurnInfo;

/** Constructores de frames servidor → cliente (protocolo §3.2). */
public final class Frames {
    private static final ObjectMapper M = new ObjectMapper();

    private Frames() {}

    private static String str(ObjectNode n) {
        return n.toString();
    }

    public static String joined(String peerId, List<String> peers, Optional<TurnInfo> turn) {
        ObjectNode n = M.createObjectNode().put("type", "joined").put("peerId", peerId);
        ArrayNode arr = n.putArray("peers");
        peers.forEach(arr::add);
        turn.ifPresent(t -> {
            ObjectNode tn = n.putObject("turn");
            ArrayNode urls = tn.putArray("urls");
            t.urls().forEach(urls::add);
            tn.put("username", t.username()).put("credential", t.credential()).put("ttl", t.ttl());
        });
        return str(n);
    }

    public static String peerJoined(String peerId) {
        return str(M.createObjectNode().put("type", "peer-joined").put("peerId", peerId));
    }

    public static String peerLeft(String peerId) {
        return str(M.createObjectNode().put("type", "peer-left").put("peerId", peerId));
    }

    public static String signal(String from, long seq, String data) {
        return str(M.createObjectNode().put("type", "signal").put("from", from).put("seq", seq).put("data", data));
    }

    public static String kicked() {
        return "{\"type\":\"kicked\"}";
    }

    public static String pong() {
        return "{\"type\":\"pong\"}";
    }

    public static String error(String code, String message) {
        ObjectNode n = M.createObjectNode().put("type", "error").put("code", code);
        if (message != null) {
            n.put("message", message);
        }
        return str(n);
    }
}
