package pe.chasqui.signal.room;

/** Destino de mensajes de un dispositivo; la implementación real envuelve un WebSocketSession. */
public interface PeerChannel {
    void send(String json);

    void close(int code, String reason);
}
