package pe.chasqui.signal.ws;

import org.springframework.web.socket.CloseStatus;

/** Códigos de error del protocolo §3.3. */
public enum ErrorCode {
    ROOM_FULL("room-full", CloseStatus.POLICY_VIOLATION),
    UNSUPPORTED_VERSION("unsupported-version", CloseStatus.POLICY_VIOLATION),
    BAD_MESSAGE("bad-message", null),
    TOO_LARGE("too-large", CloseStatus.TOO_BIG_TO_PROCESS),
    RATE_LIMITED("rate-limited", CloseStatus.POLICY_VIOLATION),
    NOT_IN_ROOM("not-in-room", null),
    UNKNOWN_PEER("unknown-peer", null),
    FORBIDDEN("forbidden", null),
    BAD_CODE("bad-code", CloseStatus.POLICY_VIOLATION),
    CODES_BUSY("codes-busy", CloseStatus.POLICY_VIOLATION);

    private final String code;
    private final CloseStatus closeStatus;

    ErrorCode(String code, CloseStatus closeStatus) {
        this.code = code;
        this.closeStatus = closeStatus;
    }

    public String code() { return code; }

    public boolean closes() { return closeStatus != null; }

    public CloseStatus closeStatus() { return closeStatus; }
}
