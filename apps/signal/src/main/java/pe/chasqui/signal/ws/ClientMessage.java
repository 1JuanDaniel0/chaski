package pe.chasqui.signal.ws;

/** Mensajes cliente → servidor ya validados (protocolo §3.1). */
public sealed interface ClientMessage {
    /** {@code resume}: token opcional para retomar el lugar en la sala tras una reconexión (null si no vino). */
    record Join(String roomId, String resume) implements ClientMessage {
        public Join(String roomId) {
            this(roomId, null);
        }
    }

    record Signal(String to, long seq, String data) implements ClientMessage {}

    record Kick(String peerId) implements ClientMessage {}

    record Report(String route, long ms) implements ClientMessage {}

    record Ping() implements ClientMessage {}

    /** Pide un casillero para mostrar un código (protocolo §9). */
    record CodeOpen() implements ClientMessage {}

    /** Entra al casillero de un código escrito; {@code slot} son sus dos primeros dígitos. */
    record CodeJoin(String slot) implements ClientMessage {}

    /** Mensaje de CPace para el otro lado del casillero; el servidor no lo interpreta. */
    record Pake(String data) implements ClientMessage {}
}
