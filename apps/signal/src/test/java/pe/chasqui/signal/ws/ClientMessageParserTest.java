package pe.chasqui.signal.ws;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class ClientMessageParserTest {
    final ClientMessageParser p = new ClientMessageParser();
    static final String ROOM = "AAAAAAAAAAAAAAAAAAAAAA";

    @Test
    void parsesValidMessages() throws Exception {
        assertEquals(new ClientMessage.Join(ROOM), p.parse("{\"type\":\"join\",\"roomId\":\"" + ROOM + "\",\"v\":1}"));
        assertEquals(new ClientMessage.Signal("peer", 5, "abc"), p.parse("{\"type\":\"signal\",\"to\":\"peer\",\"seq\":5,\"data\":\"abc\"}"));
        assertEquals(new ClientMessage.Kick("x"), p.parse("{\"type\":\"kick\",\"peerId\":\"x\"}"));
        assertEquals(new ClientMessage.Report("relay", 1234), p.parse("{\"type\":\"report\",\"route\":\"relay\",\"ms\":1234}"));
        assertEquals(new ClientMessage.Ping(), p.parse("{\"type\":\"ping\"}"));
        assertEquals(new ClientMessage.Join(ROOM, ROOM),
                p.parse("{\"type\":\"join\",\"roomId\":\"" + ROOM + "\",\"v\":1,\"resume\":\"" + ROOM + "\"}"));
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "not json", "[]", "42", "{}", "{\"type\":5}", "{\"type\":\"nope\"}",
            "{\"type\":\"join\",\"roomId\":\"short\",\"v\":1}",
            "{\"type\":\"join\",\"roomId\":\"AAAAAAAAAAAAAAAAAAAAAA\"}",
            "{\"type\":\"join\",\"roomId\":\"AAAAAAAAAAAAAAAAAAAAA!\",\"v\":1}",
            "{\"type\":\"join\",\"roomId\":\"AAAAAAAAAAAAAAAAAAAAAA\",\"v\":1,\"resume\":\"short\"}",
            "{\"type\":\"join\",\"roomId\":\"AAAAAAAAAAAAAAAAAAAAAA\",\"v\":1,\"resume\":7}",
            "{\"type\":\"signal\",\"to\":\"p\",\"seq\":0,\"data\":\"a\"}",
            "{\"type\":\"signal\",\"to\":\"p\",\"seq\":1.5,\"data\":\"a\"}",
            "{\"type\":\"signal\",\"to\":\"p\",\"seq\":1}",
            "{\"type\":\"signal\",\"seq\":1,\"data\":\"a\"}",
            "{\"type\":\"kick\"}",
            "{\"type\":\"report\",\"route\":\"weird\",\"ms\":1}",
            "{\"type\":\"report\",\"route\":\"host\",\"ms\":-1}"})
    void rejectsBadMessages(String json) {
        var e = assertThrows(ProtocolException.class, () -> p.parse(json));
        assertEquals(ErrorCode.BAD_MESSAGE, e.code());
    }

    @Test
    void wrongVersionIsUnsupported() {
        var e = assertThrows(ProtocolException.class,
                () -> p.parse("{\"type\":\"join\",\"roomId\":\"" + ROOM + "\",\"v\":2}"));
        assertEquals(ErrorCode.UNSUPPORTED_VERSION, e.code());
    }

    @Test
    void errorCodesCloseAsSpecified() {
        assertTrue(ErrorCode.ROOM_FULL.closes());
        assertTrue(ErrorCode.UNSUPPORTED_VERSION.closes());
        assertTrue(ErrorCode.TOO_LARGE.closes());
        assertTrue(ErrorCode.RATE_LIMITED.closes());
        assertFalse(ErrorCode.BAD_MESSAGE.closes());
        assertFalse(ErrorCode.NOT_IN_ROOM.closes());
        assertFalse(ErrorCode.UNKNOWN_PEER.closes());
        assertFalse(ErrorCode.FORBIDDEN.closes());
    }
}
