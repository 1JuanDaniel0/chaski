package pe.chasqui.signal.ws;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import pe.chasqui.signal.config.ChasquiProperties;
import pe.chasqui.signal.metrics.SignalMetrics;
import pe.chasqui.signal.ratelimit.FixedWindowLimiter;
import pe.chasqui.signal.ratelimit.TokenBucket;
import pe.chasqui.signal.room.Frames;
import pe.chasqui.signal.room.Peer;
import pe.chasqui.signal.room.PeerChannel;
import pe.chasqui.signal.room.RoomRegistry;
import pe.chasqui.signal.turn.TurnCredentials;

/** Handler WebSocket: valida, aplica límites y delega en {@link RoomRegistry}. No registra IPs, roomIds ni data. */
@Component
public class SignalHandler extends TextWebSocketHandler {
    private static final Logger log = LoggerFactory.getLogger(SignalHandler.class);
    private static final String ATTR_STATE = "connState";
    private static final int SEND_TIME_LIMIT_MS = 10_000;
    private static final int SEND_BUFFER_LIMIT = 512 * 1024;

    private final ChasquiProperties props;
    private final RoomRegistry registry;
    private final TurnCredentials turn;
    private final FixedWindowLimiter joinLimiter;
    private final ClientMessageParser parser;
    private final SignalMetrics metrics;

    public SignalHandler(ChasquiProperties props, RoomRegistry registry, TurnCredentials turn,
                         FixedWindowLimiter joinLimiter, ClientMessageParser parser, SignalMetrics metrics) {
        this.props = props;
        this.registry = registry;
        this.turn = turn;
        this.joinLimiter = joinLimiter;
        this.parser = parser;
        this.metrics = metrics;
    }

    /** Tope para esperar a que el último mensaje salga antes de cerrar un socket. */
    private static final long CLOSE_DRAIN_TIMEOUT_NS = 1_000_000_000L;

    /** Estado por conexión. */
    private static final class ConnState implements PeerChannel {
        final ConcurrentWebSocketSessionDecorator session;
        final String ip;
        final TokenBucket bucket;
        volatile Peer peer;

        ConnState(WebSocketSession raw, String ip, TokenBucket bucket) {
            this.session = new ConcurrentWebSocketSessionDecorator(raw, SEND_TIME_LIMIT_MS, SEND_BUFFER_LIMIT);
            this.ip = ip;
            this.bucket = bucket;
        }

        @Override
        public void send(String json) {
            try {
                session.sendMessage(new TextMessage(json));
            } catch (Exception e) {
                throw new IllegalStateException(e.getClass().getSimpleName());
            }
        }

        @Override
        public void close(int code, String reason) {
            // El decorador puede dejar el último mensaje (p. ej. "kicked" o un error) en su buffer si otro hilo
            // está terminando un envío; cerrar en ese momento lo descarta. Esperamos a que se vacíe, con tope.
            long deadline = System.nanoTime() + CLOSE_DRAIN_TIMEOUT_NS;
            while ((session.getBufferSize() > 0 || session.getTimeSinceSendStarted() > 0) && System.nanoTime() < deadline) {
                try {
                    Thread.sleep(1);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }
            try {
                session.close(new CloseStatus(code, reason));
            } catch (Exception e) {
                log.debug("close failed: {}", e.getClass().getSimpleName());
            }
        }
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession raw) {
        Object ip = raw.getAttributes().get(OriginHandshakeInterceptor.ATTR_CLIENT_IP);
        raw.getAttributes().put(ATTR_STATE,
                new ConnState(raw, ip == null ? "unknown" : ip.toString(), new TokenBucket(props.messagesPerSecond())));
        metrics.connection();
    }

    @Override
    protected void handleTextMessage(WebSocketSession raw, TextMessage message) {
        ConnState st = (ConnState) raw.getAttributes().get(ATTR_STATE);
        if (st == null) {
            return;
        }
        if (message.getPayloadLength() > props.maxFrameBytes()) {
            fail(st, ErrorCode.TOO_LARGE, "frame exceeds limit");
            return;
        }
        if (!st.bucket.tryAcquire()) {
            fail(st, ErrorCode.RATE_LIMITED, "too many messages");
            return;
        }
        ClientMessage msg;
        try {
            msg = parser.parse(message.getPayload());
        } catch (ProtocolException e) {
            fail(st, e.code(), e.getMessage());
            return;
        }
        switch (msg) {
            case ClientMessage.Ping p -> {
                if (st.peer != null) {
                    registry.touch(st.peer);
                }
                st.send(Frames.pong());
            }
            case ClientMessage.Join j -> onJoin(st, j);
            case ClientMessage.Signal s -> {
                Peer me = requirePeer(st);
                if (me != null && registry.signal(me, s.to(), s.seq(), s.data()) == RoomRegistry.RouteResult.UNKNOWN_PEER) {
                    fail(st, ErrorCode.UNKNOWN_PEER, "peer not in room");
                }
            }
            case ClientMessage.Kick k -> {
                Peer me = requirePeer(st);
                if (me != null) {
                    switch (registry.kick(me, k.peerId())) {
                        case FORBIDDEN -> fail(st, ErrorCode.FORBIDDEN, "only the first device can kick");
                        case UNKNOWN_PEER -> fail(st, ErrorCode.UNKNOWN_PEER, "peer not in room");
                        case OK -> { }
                    }
                }
            }
            case ClientMessage.Report r -> {
                if (requirePeer(st) != null) {
                    registry.touch(st.peer);
                    metrics.report(r.route());
                }
            }
        }
    }

    private Peer requirePeer(ConnState st) {
        Peer p = st.peer;
        if (p == null) {
            fail(st, ErrorCode.NOT_IN_ROOM, "join first");
        }
        return p;
    }

    private void onJoin(ConnState st, ClientMessage.Join j) {
        if (st.peer != null) {
            fail(st, ErrorCode.NOT_IN_ROOM, "already joined");
            return;
        }
        if (!joinLimiter.tryAcquire(st.ip)) {
            fail(st, ErrorCode.RATE_LIMITED, "too many joins");
            return;
        }
        switch (registry.join(j.roomId(), st, j.resume())) {
            case RoomRegistry.JoinResult.Full f -> fail(st, ErrorCode.ROOM_FULL, "room is full");
            case RoomRegistry.JoinResult.Joined ok -> {
                st.peer = ok.peer();
                st.send(Frames.joined(ok.peer().id(), ok.others(), turn.issue()));
                if (ok.replaced() != null) {
                    // Mismo dispositivo, mismo peerId: el otro no necesita enterarse. Su socket viejo se cierra
                    // y su leave() no hace nada porque ya no está en la sala.
                    ok.replaced().channel().close(RoomRegistry.CLOSE_REPLACED, "replaced");
                } else {
                    registry.announceJoin(ok.peer(), ok.others());
                }
            }
        }
    }

    private void fail(ConnState st, ErrorCode code, String message) {
        metrics.error(code.code());
        try {
            st.send(Frames.error(code.code(), message));
        } catch (RuntimeException e) {
            log.debug("error frame not sent");
        }
        if (code.closes()) {
            st.close(code.closeStatus().getCode(), code.code());
        }
    }

    @Override
    public void handleTransportError(WebSocketSession raw, Throwable exception) {
        log.debug("transport error: {}", exception.getClass().getSimpleName());
        ConnState st = (ConnState) raw.getAttributes().get(ATTR_STATE);
        if (st != null) {
            st.close(CloseStatus.SERVER_ERROR.getCode(), "transport error");
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession raw, CloseStatus status) {
        ConnState st = (ConnState) raw.getAttributes().get(ATTR_STATE);
        if (st != null && st.peer != null) {
            registry.leave(st.peer);
        }
    }
}
