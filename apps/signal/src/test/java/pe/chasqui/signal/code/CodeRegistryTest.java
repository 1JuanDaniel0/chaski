package pe.chasqui.signal.code;

import static org.junit.jupiter.api.Assertions.*;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import pe.chasqui.signal.config.ChasquiProperties;
import pe.chasqui.signal.metrics.SignalMetrics;
import pe.chasqui.signal.room.PeerChannel;

class CodeRegistryTest {
    static class FakeChannel implements PeerChannel {
        final List<String> sent = new ArrayList<>();
        int closeCode = -1;

        public void send(String json) { sent.add(json); }

        public void close(int code, String reason) { closeCode = code; }
    }

    static class MutableClock extends Clock {
        Instant now = Instant.parse("2026-01-01T00:00:00Z");

        public ZoneOffset getZone() { return ZoneOffset.UTC; }

        public Clock withZone(java.time.ZoneId z) { return this; }

        public Instant instant() { return now; }

        void advance(Duration d) { now = now.plus(d); }
    }

    MutableClock clock;
    CodeRegistry codes;

    CodeRegistry registry(int slots) {
        var props = new ChasquiProperties(List.of(), 65536, 2, 10, 20, Duration.ofMinutes(10), Duration.ofMinutes(30),
                30000, null, new ChasquiProperties.Code(slots, Duration.ofSeconds(120), Duration.ofSeconds(30), 2));
        return new CodeRegistry(props, clock, new SignalMetrics(new SimpleMeterRegistry()));
    }

    @BeforeEach
    void setUp() {
        clock = new MutableClock();
        codes = registry(100);
    }

    @Test
    void openGivesTwoDigitSlotsAndRunsOut() {
        var small = registry(3);
        Set<String> ids = new HashSet<>();
        for (int i = 0; i < 3; i++) {
            ids.add(small.open(new FakeChannel()).slotId());
        }
        assertEquals(Set.of("00", "01", "02"), ids);
        assertNull(small.open(new FakeChannel()));
    }

    @Test
    void joinPairsOnceWithSameSid() {
        var host = new FakeChannel();
        var guest = new FakeChannel();
        String slot = codes.open(host).slotId();
        assertNotNull(codes.join(slot, guest));
        assertEquals(1, host.sent.size());
        assertTrue(host.sent.get(0).startsWith("{\"type\":\"code-paired\",\"sid\":\""));
        assertEquals(host.sent, guest.sent);
        assertNull(codes.join(slot, new FakeChannel()), "un código sirve una sola vez");
        assertNull(codes.join(slot.equals("00") ? "01" : "00", new FakeChannel()), "casillero que nadie abrió");
    }

    @Test
    void pakeIsRelayedAndLimited() {
        var host = new FakeChannel();
        var guest = new FakeChannel();
        var h = codes.open(host);
        assertEquals(CodeRegistry.PakeResult.NOT_PAIRED, codes.pake(h, "AAAA"));
        var g = codes.join(h.slotId(), guest);
        assertEquals(CodeRegistry.PakeResult.OK, codes.pake(h, "AAAA"));
        assertEquals("{\"type\":\"pake\",\"data\":\"AAAA\"}", guest.sent.get(1));
        assertEquals(CodeRegistry.PakeResult.OK, codes.pake(g, "BBBB"));
        assertEquals(CodeRegistry.PakeResult.OK, codes.pake(h, "CCCC"));
        assertEquals(CodeRegistry.PakeResult.TOO_MANY, codes.pake(h, "DDDD"));
    }

    @Test
    void leavingClosesTheOtherSideAndFreesTheSlot() {
        var host = new FakeChannel();
        var guest = new FakeChannel();
        var h = codes.open(host);
        var g = codes.join(h.slotId(), guest);
        codes.leave(g);
        assertEquals(CodeRegistry.CLOSE_CODE_CLOSED, host.closeCode);
        assertEquals(0, codes.size());
        codes.leave(h);
        assertEquals(-1, guest.closeCode, "idempotente: el que se fue no se vuelve a cerrar");
        assertEquals(CodeRegistry.PakeResult.NOT_PAIRED, codes.pake(h, "AAAA"));
    }

    @Test
    void sweepExpiresUnusedAndStalledCodes() {
        var unused = new FakeChannel();
        codes.open(unused);
        var host = new FakeChannel();
        var guest = new FakeChannel();
        clock.advance(Duration.ofSeconds(100));
        var h = codes.open(host);
        clock.advance(Duration.ofSeconds(20));
        codes.join(h.slotId(), guest);
        assertEquals(1, codes.sweep());
        assertEquals(CodeRegistry.CLOSE_EXPIRED, unused.closeCode);
        clock.advance(Duration.ofSeconds(30));
        assertEquals(1, codes.sweep());
        assertEquals(CodeRegistry.CLOSE_EXPIRED, host.closeCode);
        assertEquals(CodeRegistry.CLOSE_EXPIRED, guest.closeCode);
        assertEquals(0, codes.size());
    }
}
