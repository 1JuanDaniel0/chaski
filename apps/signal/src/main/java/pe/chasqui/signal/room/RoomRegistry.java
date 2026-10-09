package pe.chasqui.signal.room;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Clock;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import pe.chasqui.signal.config.ChasquiProperties;
import pe.chasqui.signal.metrics.SignalMetrics;

/**
 * Salas en memoria. Las mutaciones (join/leave/kick/sweep) se serializan con un candado;
 * los envíos a los sockets se hacen siempre fuera del candado.
 */
@Component
public class RoomRegistry {
    private static final Logger log = LoggerFactory.getLogger(RoomRegistry.class);
    public static final int CLOSE_POLICY = 1008;
    public static final int CLOSE_ROOM_EXPIRED = 4000;
    public static final int CLOSE_REPLACED = 4001;

    public sealed interface JoinResult {
        /** {@code replaced}: el socket anterior del mismo dispositivo, que hay que cerrar; null si no hubo. */
        record Joined(Peer peer, List<String> others, Peer replaced) implements JoinResult {
            public Joined(Peer peer, List<String> others) {
                this(peer, others, null);
            }
        }

        record Full() implements JoinResult {}
    }

    public enum RouteResult { OK, UNKNOWN_PEER }

    public enum KickResult { OK, FORBIDDEN, UNKNOWN_PEER }

    private final Map<String, Room> rooms = new ConcurrentHashMap<>();
    private final Object lock = new Object();
    private final SecureRandom random = new SecureRandom();
    private final Clock clock;
    private final SignalMetrics metrics;
    private final int maxPeers;
    private final long singlePeerTtlMs;
    private final long inactivityTtlMs;

    public RoomRegistry(ChasquiProperties props, Clock clock, SignalMetrics metrics) {
        this.clock = clock;
        this.metrics = metrics;
        this.maxPeers = props.maxPeersPerRoom();
        this.singlePeerTtlMs = props.singlePeerTtl().toMillis();
        this.inactivityTtlMs = props.inactivityTtl().toMillis();
        metrics.bindRooms(rooms::size);
    }

    public int size() {
        return rooms.size();
    }

    private String newPeerId() {
        byte[] b = new byte[8];
        random.nextBytes(b);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(b);
    }

    public JoinResult join(String roomId, PeerChannel channel) {
        return join(roomId, channel, null);
    }

    /**
     * Agrega el dispositivo a la sala. No avisa a nadie: ver {@link #announceJoin}.
     * Si {@code resume} coincide con el de un dispositivo presente, este socket lo reemplaza con el mismo
     * {@code peerId} (y el mismo rol de dueño): es el mismo dispositivo que volvió tras perder la red y cuyo
     * socket anterior el servidor aún no vio caer.
     */
    public JoinResult join(String roomId, PeerChannel channel, String resume) {
        long now = clock.millis();
        synchronized (lock) {
            Room room = rooms.get(roomId);
            if (room == null) {
                room = new Room(roomId, now);
                rooms.put(roomId, room);
                metrics.roomCreated();
            }
            Peer stale = resume == null ? null : room.peers.values().stream()
                    .filter(p -> p.resume != null && sameToken(p.resume, resume))
                    .findFirst().orElse(null);
            if (stale != null) {
                Peer peer = new Peer(stale.id, room, channel, resume);
                room.peers.put(peer.id, peer);
                room.lastActivity = now;
                List<String> others = room.peerIds().stream().filter(id -> !id.equals(peer.id)).toList();
                metrics.resumed();
                return new JoinResult.Joined(peer, others, stale);
            }
            if (room.peers.size() >= maxPeers) {
                return new JoinResult.Full();
            }
            Peer peer = new Peer(newPeerId(), room, channel, resume);
            List<String> others = room.peerIds();
            if (room.peers.isEmpty()) {
                room.ownerId = peer.id;
            }
            room.peers.put(peer.id, peer);
            room.lastActivity = now;
            if (room.peers.size() >= 2) {
                metrics.roomPaired();
            }
            return new JoinResult.Joined(peer, others);
        }
    }

    /**
     * Envía {@code peer-joined} solo a quienes ya estaban al hacer {@code join} (los {@code others}),
     * para no avisar de más si alguien entró después. Se llama tras enviar {@code joined} al nuevo.
     */
    public void announceJoin(Peer peer, List<String> others) {
        String frame = Frames.peerJoined(peer.id);
        for (String id : others) {
            Peer other = peer.room.peers.get(id);
            if (other != null) {
                safeSend(other, frame);
            }
        }
    }

    public RouteResult signal(Peer from, String to, long seq, String data) {
        Peer target = from.room.peers.get(to);
        if (target == null || target == from) {
            return RouteResult.UNKNOWN_PEER;
        }
        from.room.lastActivity = clock.millis();
        safeSend(target, Frames.signal(from.id, seq, data));
        return RouteResult.OK;
    }

    public KickResult kick(Peer by, String targetId) {
        Room room = by.room;
        if (!by.id.equals(room.ownerId)) {
            return KickResult.FORBIDDEN;
        }
        Peer target = room.peers.get(targetId);
        if (target == null || target == by) {
            return KickResult.UNKNOWN_PEER;
        }
        room.lastActivity = clock.millis();
        safeSend(target, Frames.kicked());
        safeClose(target, CLOSE_POLICY, "kicked");
        return KickResult.OK;
    }

    public void touch(Peer peer) {
        peer.room.lastActivity = clock.millis();
    }

    /** Saca al dispositivo (idempotente), avisa {@code peer-left} y borra la sala si queda vacía. */
    public void leave(Peer peer) {
        Room room = peer.room;
        List<Peer> remaining;
        synchronized (lock) {
            if (!room.peers.remove(peer.id, peer)) {
                return;
            }
            if (room.peers.isEmpty()) {
                rooms.remove(room.id, room);
                return;
            }
            if (peer.id.equals(room.ownerId)) {
                room.ownerId = room.peers.keySet().iterator().next();
            }
            if (room.peers.size() == 1) {
                room.singleSince = clock.millis();
            }
            remaining = new ArrayList<>(room.peers.values());
        }
        if (room.expired) {
            return;
        }
        String frame = Frames.peerLeft(peer.id);
        remaining.forEach(p -> safeSend(p, frame));
    }

    /** Expira salas vencidas y cierra sus sockets. Devuelve cuántas expiraron. */
    public int sweep() {
        long now = clock.millis();
        List<Room> dead = new ArrayList<>();
        synchronized (lock) {
            for (Room r : rooms.values()) {
                boolean single = r.peers.size() < 2 && now - r.singleSince >= singlePeerTtlMs;
                boolean idle = now - r.lastActivity >= inactivityTtlMs;
                if (single || idle) {
                    r.expired = true;
                    dead.add(r);
                }
            }
            dead.forEach(r -> rooms.remove(r.id, r));
        }
        for (Room r : dead) {
            for (Peer p : new ArrayList<>(r.peers.values())) {
                safeClose(p, CLOSE_ROOM_EXPIRED, "room-expired");
            }
        }
        return dead.size();
    }

    private static boolean sameToken(String a, String b) {
        return MessageDigest.isEqual(a.getBytes(StandardCharsets.US_ASCII), b.getBytes(StandardCharsets.US_ASCII));
    }

    private void safeSend(Peer p, String json) {
        try {
            p.channel.send(json);
        } catch (RuntimeException e) {
            log.debug("send failed: {}", e.getClass().getSimpleName());
        }
    }

    private void safeClose(Peer p, int code, String reason) {
        try {
            p.channel.close(code, reason);
        } catch (RuntimeException e) {
            log.debug("close failed: {}", e.getClass().getSimpleName());
        }
    }
}
