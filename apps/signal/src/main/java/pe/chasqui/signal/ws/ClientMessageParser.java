package pe.chasqui.signal.ws;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

/** Valida estructura y tipos; nunca interpreta {@code data}. */
@Component
public class ClientMessageParser {
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final Pattern ROOM_ID = Pattern.compile("^[A-Za-z0-9_-]{22}$");
    private static final Pattern TOKEN = ROOM_ID;
    private static final Set<String> ROUTES = Set.of("host", "srflx", "relay", "failed");
    private static final int MAX_PEER_ID = 64;

    public ClientMessage parse(String text) throws ProtocolException {
        JsonNode n;
        try {
            n = MAPPER.readTree(text);
        } catch (JsonProcessingException e) {
            throw bad("invalid json");
        }
        if (n == null || !n.isObject()) {
            throw bad("not an object");
        }
        String type = string(n, "type");
        if (type == null) {
            throw bad("missing type");
        }
        return switch (type) {
            case "join" -> join(n);
            case "signal" -> {
                String to = peerId(n, "to");
                long seq = integer(n, "seq", true);
                String data = string(n, "data");
                if (data == null || data.isEmpty()) {
                    throw bad("invalid data");
                }
                yield new ClientMessage.Signal(to, seq, data);
            }
            case "kick" -> new ClientMessage.Kick(peerId(n, "peerId"));
            case "report" -> {
                String route = string(n, "route");
                if (route == null || !ROUTES.contains(route)) {
                    throw bad("invalid route");
                }
                yield new ClientMessage.Report(route, n.has("ms") ? integer(n, "ms", false) : 0);
            }
            case "ping" -> new ClientMessage.Ping();
            default -> throw bad("unknown type");
        };
    }

    private ClientMessage join(JsonNode n) throws ProtocolException {
        long v = integer(n, "v", false);
        if (v != 1) {
            throw new ProtocolException(ErrorCode.UNSUPPORTED_VERSION, "only v=1 is supported");
        }
        String roomId = string(n, "roomId");
        if (roomId == null || !ROOM_ID.matcher(roomId).matches()) {
            throw bad("invalid roomId");
        }
        String resume = null;
        if (n.has("resume")) {
            resume = string(n, "resume");
            if (resume == null || !TOKEN.matcher(resume).matches()) {
                throw bad("invalid resume");
            }
        }
        return new ClientMessage.Join(roomId, resume);
    }

    private static String string(JsonNode n, String field) {
        JsonNode v = n.get(field);
        return v != null && v.isTextual() ? v.asText() : null;
    }

    private static String peerId(JsonNode n, String field) throws ProtocolException {
        String s = string(n, field);
        if (s == null || s.isEmpty() || s.length() > MAX_PEER_ID) {
            throw bad("invalid " + field);
        }
        return s;
    }

    private static long integer(JsonNode n, String field, boolean positive) throws ProtocolException {
        JsonNode v = n.get(field);
        if (v == null || !v.isIntegralNumber() || !v.canConvertToLong()) {
            throw bad("invalid " + field);
        }
        long l = v.asLong();
        if (l < 0 || (positive && l < 1)) {
            throw bad("invalid " + field);
        }
        return l;
    }

    private static ProtocolException bad(String why) {
        return new ProtocolException(ErrorCode.BAD_MESSAGE, why);
    }
}
