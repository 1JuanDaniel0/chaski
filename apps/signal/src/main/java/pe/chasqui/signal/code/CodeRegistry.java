package pe.chasqui.signal.code;

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
import pe.chasqui.signal.room.Frames;
import pe.chasqui.signal.room.PeerChannel;

/**
 * Casilleros del emparejamiento por código (RF6, protocolo §9). Un casillero junta dos sockets, el de quien
 * muestra el código y el de quien lo escribe, solo para que se pasen los mensajes de CPace. El servidor conoce el
 * casillero (los dos primeros dígitos) pero nunca el resto del código, así que no puede sacar la clave.
 * Cada casillero sirve una sola vez: al cerrarse cualquiera de los dos sockets, se cierra el otro y se libera.
 */
@Component
public class CodeRegistry {
    private static final Logger log = LoggerFactory.getLogger(CodeRegistry.class);
    public static final int CLOSE_EXPIRED = 4000;
    public static final int CLOSE_CODE_CLOSED = 4002;

    /** Un lado de un casillero. */
    public static final class Side {
        final Slot slot;
        final PeerChannel channel;
        final boolean host;
        int pakeSent;

        Side(Slot slot, PeerChannel channel, boolean host) {
            this.slot = slot;
            this.channel = channel;
            this.host = host;
        }

        public String slotId() {
            return slot.id;
        }
    }

    static final class Slot {
        final String id;
        final long openedAt;
        Side host;
        Side guest;
        long pairedAt;
        boolean closed;

        Slot(String id, long openedAt) {
            this.id = id;
            this.openedAt = openedAt;
        }

        Side other(Side s) {
            return s == host ? guest : host;
        }
    }

    public enum PakeResult { OK, NOT_PAIRED, TOO_MANY }

    private final Map<String, Slot> slots = new ConcurrentHashMap<>();
    private final Object lock = new Object();
    private final SecureRandom random = new SecureRandom();
    private final Clock clock;
    private final SignalMetrics metrics;
    private final int slotCount;
    private final long openTtlMs;
    private final long pairedTtlMs;
    private final int maxPake;

    public CodeRegistry(ChasquiProperties props, Clock clock, SignalMetrics metrics) {
        this.clock = clock;
        this.metrics = metrics;
        this.slotCount = props.code().slots();
        this.openTtlMs = props.code().openTtl().toMillis();
        this.pairedTtlMs = props.code().pairedTtl().toMillis();
        this.maxPake = props.code().maxPake();
    }

    public long openTtlSeconds() {
        return openTtlMs / 1000;
    }

    /** Reserva un casillero libre al azar para quien muestra el código; null si están todos ocupados. */
    public Side open(PeerChannel channel) {
        synchronized (lock) {
            List<String> free = new ArrayList<>();
            for (int i = 0; i < slotCount; i++) {
                String id = String.format("%02d", i);
                if (!slots.containsKey(id)) {
                    free.add(id);
                }
            }
            if (free.isEmpty()) {
                return null;
            }
            Slot slot = new Slot(free.get(random.nextInt(free.size())), clock.millis());
            slot.host = new Side(slot, channel, true);
            slots.put(slot.id, slot);
            metrics.codeOpened();
            return slot.host;
        }
    }

    /**
     * Entra a un casillero abierto que nadie ha usado. Si lo logra, avisa {@code code-paired} a los dos con el mismo
     * {@code sid}. Devuelve null si el código no existe, venció o ya se usó.
     */
    public Side join(String slotId, PeerChannel channel) {
        Side guest;
        synchronized (lock) {
            Slot slot = slots.get(slotId);
            if (slot == null || slot.closed || slot.guest != null) {
                return null;
            }
            guest = new Side(slot, channel, false);
            slot.guest = guest;
            slot.pairedAt = clock.millis();
        }
        metrics.codePaired();
        byte[] sid = new byte[16];
        random.nextBytes(sid);
        String frame = Frames.codePaired(Base64.getUrlEncoder().withoutPadding().encodeToString(sid));
        safeSend(guest.slot.host, frame);
        safeSend(guest, frame);
        return guest;
    }

    /** Reenvía un mensaje de CPace al otro lado, sin leerlo. */
    public PakeResult pake(Side from, String data) {
        Side to;
        synchronized (lock) {
            to = from.slot.other(from);
            if (to == null || from.slot.closed) {
                return PakeResult.NOT_PAIRED;
            }
            if (from.pakeSent >= maxPake) {
                return PakeResult.TOO_MANY;
            }
            from.pakeSent++;
        }
        safeSend(to, Frames.pake(data));
        return PakeResult.OK;
    }

    /** Un socket del casillero se cerró: se cierra el otro y el casillero queda libre (idempotente). */
    public void leave(Side side) {
        Side other;
        synchronized (lock) {
            Slot slot = side.slot;
            if (slot.closed) {
                return;
            }
            slot.closed = true;
            slots.remove(slot.id, slot);
            other = slot.other(side);
        }
        if (other != null) {
            safeClose(other, CLOSE_CODE_CLOSED, "code-closed");
        }
    }

    /** Cierra los casilleros vencidos: sin usar tras {@code openTtl}, o sin terminar CPace tras {@code pairedTtl}. */
    public int sweep() {
        long now = clock.millis();
        List<Slot> dead = new ArrayList<>();
        synchronized (lock) {
            for (Slot s : slots.values()) {
                boolean expired = s.guest == null ? now - s.openedAt >= openTtlMs : now - s.pairedAt >= pairedTtlMs;
                if (expired) {
                    s.closed = true;
                    dead.add(s);
                }
            }
            dead.forEach(s -> slots.remove(s.id, s));
        }
        for (Slot s : dead) {
            safeClose(s.host, CLOSE_EXPIRED, "code-expired");
            if (s.guest != null) {
                safeClose(s.guest, CLOSE_EXPIRED, "code-expired");
            }
        }
        return dead.size();
    }

    public int size() {
        return slots.size();
    }

    private void safeSend(Side s, String json) {
        try {
            s.channel.send(json);
        } catch (RuntimeException e) {
            log.debug("send failed: {}", e.getClass().getSimpleName());
        }
    }

    private void safeClose(Side s, int code, String reason) {
        try {
            s.channel.close(code, reason);
        } catch (RuntimeException e) {
            log.debug("close failed: {}", e.getClass().getSimpleName());
        }
    }
}
