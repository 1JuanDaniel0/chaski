package pe.chasqui.signal.room;

import static org.junit.jupiter.api.Assertions.*;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import pe.chasqui.signal.config.ChasquiProperties;
import pe.chasqui.signal.metrics.SignalMetrics;
import pe.chasqui.signal.room.RoomRegistry.JoinResult;

class RoomRegistryTest {
    static final String ROOM = "AAAAAAAAAAAAAAAAAAAAAA";

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
    RoomRegistry registry;

    @BeforeEach
    void setUp() {
        clock = new MutableClock();
        var props = new ChasquiProperties(List.of(), 65536, 2, 10, 20, Duration.ofMinutes(10), Duration.ofMinutes(30),
                30000, new ChasquiProperties.Turn("", List.of(), 3600));
        registry = new RoomRegistry(props, clock, new SignalMetrics(new SimpleMeterRegistry()));
    }

    Peer join(FakeChannel ch) {
        var r = registry.join(ROOM, ch);
        var j = assertInstanceOf(JoinResult.Joined.class, r);
        registry.announceJoin(j.peer(), j.others());
        return j.peer();
    }

    @Test
    void secondJoinSeesFirstAndFirstIsNotified() {
        var c1 = new FakeChannel();
        var c2 = new FakeChannel();
        Peer a = join(c1);
        var j = (JoinResult.Joined) registry.join(ROOM, c2);
        assertEquals(List.of(a.id()), j.others());
        registry.announceJoin(j.peer(), j.others());
        assertEquals(1, c1.sent.size());
        assertTrue(c1.sent.get(0).contains("\"peer-joined\"") && c1.sent.get(0).contains(j.peer().id()));
        assertEquals(11, a.id().length());
    }

    @Test
    void thirdPeerGetsFull() {
        join(new FakeChannel());
        join(new FakeChannel());
        assertInstanceOf(JoinResult.Full.class, registry.join(ROOM, new FakeChannel()));
    }

    @Test
    void signalRewritesToAsFromAndKeepsSeqAndData() {
        var c1 = new FakeChannel();
        var c2 = new FakeChannel();
        Peer a = join(c1);
        Peer b = join(c2);
        assertEquals(RoomRegistry.RouteResult.OK, registry.signal(a, b.id(), 7, "ZGF0YQ"));
        String f = c2.sent.get(c2.sent.size() - 1);
        assertEquals("{\"type\":\"signal\",\"from\":\"" + a.id() + "\",\"seq\":7,\"data\":\"ZGF0YQ\"}", f);
        assertFalse(f.contains("\"to\""));
    }

    @Test
    void signalToUnknownPeer() {
        Peer a = join(new FakeChannel());
        assertEquals(RoomRegistry.RouteResult.UNKNOWN_PEER, registry.signal(a, "nope", 1, "x"));
        assertEquals(RoomRegistry.RouteResult.UNKNOWN_PEER, registry.signal(a, a.id(), 1, "x"));
    }

    @Test
    void kickOnlyByOwner() {
        var c1 = new FakeChannel();
        var c2 = new FakeChannel();
        Peer a = join(c1);
        Peer b = join(c2);
        assertEquals(RoomRegistry.KickResult.FORBIDDEN, registry.kick(b, a.id()));
        assertEquals(RoomRegistry.KickResult.UNKNOWN_PEER, registry.kick(a, "zzz"));
        assertEquals(RoomRegistry.KickResult.OK, registry.kick(a, b.id()));
        assertEquals("{\"type\":\"kicked\"}", c2.sent.get(c2.sent.size() - 1));
        assertEquals(RoomRegistry.CLOSE_POLICY, c2.closeCode);
    }

    @Test
    void leaveNotifiesAndEmptyRoomIsRemoved() {
        var c1 = new FakeChannel();
        Peer a = join(c1);
        Peer b = join(new FakeChannel());
        registry.leave(b);
        registry.leave(b); // idempotente
        assertTrue(c1.sent.get(c1.sent.size() - 1).contains("\"peer-left\""));
        assertEquals(1, registry.size());
        registry.leave(a);
        assertEquals(0, registry.size());
        // la sala puede reutilizarse
        assertInstanceOf(JoinResult.Joined.class, registry.join(ROOM, new FakeChannel()));
    }

    @Test
    void ownershipPassesWhenOwnerLeaves() {
        Peer a = join(new FakeChannel());
        Peer b = join(new FakeChannel());
        registry.leave(a);
        Peer c = join(new FakeChannel());
        assertEquals(RoomRegistry.KickResult.OK, registry.kick(b, c.id()));
    }

    @Test
    void singlePeerRoomExpiresAfterTenMinutes() {
        var c1 = new FakeChannel();
        join(c1);
        clock.advance(Duration.ofMinutes(9));
        assertEquals(0, registry.sweep());
        clock.advance(Duration.ofMinutes(1));
        assertEquals(1, registry.sweep());
        assertEquals(RoomRegistry.CLOSE_ROOM_EXPIRED, c1.closeCode);
        assertEquals(0, registry.size());
    }

    @Test
    void pairedRoomExpiresOnlyAfterInactivity() {
        var c1 = new FakeChannel();
        Peer a = join(c1);
        Peer b = join(new FakeChannel());
        clock.advance(Duration.ofMinutes(25));
        assertEquals(0, registry.sweep());
        registry.signal(a, b.id(), 1, "x"); // actividad
        clock.advance(Duration.ofMinutes(25));
        assertEquals(0, registry.sweep());
        clock.advance(Duration.ofMinutes(5));
        assertEquals(1, registry.sweep());
        assertEquals(RoomRegistry.CLOSE_ROOM_EXPIRED, c1.closeCode);
        registry.leave(a); // no debe fallar tras expirar
    }

    @Test
    void singleTimerRestartsWhenPeerLeaves() {
        Peer a = join(new FakeChannel());
        Peer b = join(new FakeChannel());
        clock.advance(Duration.ofMinutes(15));
        registry.signal(a, b.id(), 1, "x");
        registry.leave(b);
        clock.advance(Duration.ofMinutes(9));
        assertEquals(0, registry.sweep());
        clock.advance(Duration.ofMinutes(1));
        assertEquals(1, registry.sweep());
    }

    static final String TOKEN_A = "TTTTTTTTTTTTTTTTTTTTTA";

    @Test
    void resumeReplacesStaleSocketKeepingIdAndOwnership() {
        var old = new FakeChannel();
        var other = new FakeChannel();
        Peer a = assertInstanceOf(JoinResult.Joined.class, registry.join(ROOM, old, TOKEN_A)).peer();
        Peer b = join(other);
        int seen = other.sent.size();

        var fresh = new FakeChannel();
        var j = assertInstanceOf(JoinResult.Joined.class, registry.join(ROOM, fresh, TOKEN_A));
        assertEquals(a.id(), j.peer().id());
        assertEquals(List.of(b.id()), j.others());
        assertSame(a, j.replaced());
        assertEquals(seen, other.sent.size(), "el otro no recibe peer-joined ni peer-left");

        // El leave() del socket viejo ya no saca a nadie.
        registry.leave(a);
        assertEquals(seen, other.sent.size());
        assertEquals(RoomRegistry.RouteResult.OK, registry.signal(b, a.id(), 1, "x"));
        assertTrue(fresh.sent.get(fresh.sent.size() - 1).contains("\"signal\""));
        // Sigue siendo el dueño.
        assertEquals(RoomRegistry.KickResult.OK, registry.kick(j.peer(), b.id()));
    }

    @Test
    void wrongOrMissingResumeTokenDoesNotReplace() {
        registry.join(ROOM, new FakeChannel(), TOKEN_A);
        join(new FakeChannel());
        assertInstanceOf(JoinResult.Full.class, registry.join(ROOM, new FakeChannel(), "TTTTTTTTTTTTTTTTTTTTTB"));
        assertInstanceOf(JoinResult.Full.class, registry.join(ROOM, new FakeChannel()));
    }

    @Test
    void resumeAfterServerSawTheDropIsANormalJoin() {
        var c1 = new FakeChannel();
        Peer a = assertInstanceOf(JoinResult.Joined.class, registry.join(ROOM, new FakeChannel(), TOKEN_A)).peer();
        join(c1);
        registry.leave(a);
        var j = assertInstanceOf(JoinResult.Joined.class, registry.join(ROOM, new FakeChannel(), TOKEN_A));
        assertNull(j.replaced());
        assertNotEquals(a.id(), j.peer().id());
    }
}
