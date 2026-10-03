package pe.chasqui.signal.ws;

/** Mensajes cliente → servidor ya validados (protocolo §3.1). */
public sealed interface ClientMessage {
    record Join(String roomId) implements ClientMessage {}

    record Signal(String to, long seq, String data) implements ClientMessage {}

    record Kick(String peerId) implements ClientMessage {}

    record Report(String route, long ms) implements ClientMessage {}

    record Ping() implements ClientMessage {}
}
