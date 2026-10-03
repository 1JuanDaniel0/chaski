package pe.chasqui.signal.ws;

public class ProtocolException extends Exception {
    private final ErrorCode code;

    public ProtocolException(ErrorCode code, String message) {
        super(message, null, false, false);
        this.code = code;
    }

    public ErrorCode code() { return code; }
}
