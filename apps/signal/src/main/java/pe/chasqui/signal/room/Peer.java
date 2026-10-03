package pe.chasqui.signal.room;

public final class Peer {
    final String id;
    final Room room;
    final PeerChannel channel;

    Peer(String id, Room room, PeerChannel channel) {
        this.id = id;
        this.room = room;
        this.channel = channel;
    }

    public String id() { return id; }
}
