package pe.chasqui.signal.ratelimit;

import static org.junit.jupiter.api.Assertions.*;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;

class RateLimiterTest {
    @Test
    void fixedWindowLimitsPerKeyAndResets() {
        AtomicLong ms = new AtomicLong(1000);
        Clock clock = new Clock() {
            public java.time.ZoneId getZone() { return ZoneId.of("UTC"); }
            public Clock withZone(ZoneId z) { return this; }
            public Instant instant() { return Instant.ofEpochMilli(ms.get()); }
        };
        var l = new FixedWindowLimiter(3, 60_000, clock);
        for (int i = 0; i < 3; i++) assertTrue(l.tryAcquire("a"));
        assertFalse(l.tryAcquire("a"));
        assertTrue(l.tryAcquire("b"));
        ms.addAndGet(59_999);
        assertFalse(l.tryAcquire("a"));
        ms.addAndGet(1);
        assertTrue(l.tryAcquire("a"));
        ms.addAndGet(60_000);
        l.sweep();
        assertEquals(0, l.size());
    }

    @Test
    void tokenBucketAllowsBurstThenRefills() {
        AtomicLong nanos = new AtomicLong(0);
        var b = new TokenBucket(20, nanos::get);
        for (int i = 0; i < 20; i++) assertTrue(b.tryAcquire(), "burst " + i);
        assertFalse(b.tryAcquire());
        nanos.addAndGet(50_000_000L); // 50 ms = 1 token
        assertTrue(b.tryAcquire());
        assertFalse(b.tryAcquire());
        nanos.addAndGet(10_000_000_000L); // no excede la capacidad
        int ok = 0;
        while (b.tryAcquire()) ok++;
        assertEquals(20, ok);
    }
}
