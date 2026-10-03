package pe.chasqui.signal.ratelimit;

import java.util.function.LongSupplier;

/** Cubeta de tokens por conexión: {@code ratePerSecond} tokens/s, ráfaga igual a la tasa. */
public class TokenBucket {
    private final double capacity;
    private final double refillPerNano;
    private final LongSupplier nanos;
    private double tokens;
    private long last;

    public TokenBucket(int ratePerSecond, LongSupplier nanos) {
        this.capacity = ratePerSecond;
        this.refillPerNano = ratePerSecond / 1_000_000_000.0;
        this.nanos = nanos;
        this.tokens = capacity;
        this.last = nanos.getAsLong();
    }

    public TokenBucket(int ratePerSecond) {
        this(ratePerSecond, System::nanoTime);
    }

    public synchronized boolean tryAcquire() {
        long now = nanos.getAsLong();
        tokens = Math.min(capacity, tokens + (now - last) * refillPerNano);
        last = now;
        if (tokens >= 1.0) {
            tokens -= 1.0;
            return true;
        }
        return false;
    }
}
