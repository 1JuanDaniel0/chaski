package pe.chasqui.signal.ratelimit;

import java.time.Clock;
import java.util.concurrent.ConcurrentHashMap;

/** Ventana fija en memoria: como máximo {@code limit} eventos por clave y ventana. */
public class FixedWindowLimiter {
    private static final class Window {
        long start;
        int count;
    }

    private final int limit;
    private final long windowMillis;
    private final Clock clock;
    private final ConcurrentHashMap<String, Window> windows = new ConcurrentHashMap<>();

    public FixedWindowLimiter(int limit, long windowMillis, Clock clock) {
        this.limit = limit;
        this.windowMillis = windowMillis;
        this.clock = clock;
    }

    public boolean tryAcquire(String key) {
        long now = clock.millis();
        boolean[] ok = new boolean[1];
        windows.compute(key, (k, w) -> {
            if (w == null || now - w.start >= windowMillis) {
                w = new Window();
                w.start = now;
            }
            if (w.count < limit) {
                w.count++;
                ok[0] = true;
            }
            return w;
        });
        return ok[0];
    }

    /** Elimina ventanas vencidas para no acumular memoria. */
    public void sweep() {
        long now = clock.millis();
        windows.entrySet().removeIf(e -> now - e.getValue().start >= windowMillis);
    }

    public int size() {
        return windows.size();
    }
}
