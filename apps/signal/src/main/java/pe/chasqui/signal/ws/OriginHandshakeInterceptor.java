package pe.chasqui.signal.ws;

import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;
import pe.chasqui.signal.config.ChasquiProperties;

/** Valida {@code Origin} (403 si no está permitido) y captura la IP del cliente. */
public class OriginHandshakeInterceptor implements HandshakeInterceptor {
    public static final String ATTR_CLIENT_IP = "clientIp";

    private final Set<String> allowed;

    public OriginHandshakeInterceptor(ChasquiProperties props) {
        this.allowed = Set.copyOf(props.allowedOrigins().stream().map(String::trim).filter(s -> !s.isEmpty()).toList());
    }

    @Override
    public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response, WebSocketHandler wsHandler,
                                   Map<String, Object> attributes) {
        String origin = request.getHeaders().getOrigin();
        if (origin == null || !allowed.contains(origin)) {
            response.setStatusCode(HttpStatus.FORBIDDEN);
            return false;
        }
        attributes.put(ATTR_CLIENT_IP, clientIp(request));
        return true;
    }

    static String clientIp(ServerHttpRequest request) {
        String cf = request.getHeaders().getFirst("CF-Connecting-IP");
        if (cf != null && !cf.isBlank()) {
            return cf.trim();
        }
        var remote = request.getRemoteAddress();
        return remote != null && remote.getAddress() != null ? remote.getAddress().getHostAddress() : "unknown";
    }

    @Override
    public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response, WebSocketHandler wsHandler,
                               Exception exception) {}
}
