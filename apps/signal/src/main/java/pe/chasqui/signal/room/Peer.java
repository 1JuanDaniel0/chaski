package pe.chasqui.signal.room;

public final class Peer {
    final String id;
    final Room room;
    final PeerChannel channel;
    /** Token que el cliente envía en {@code join} para retomar su lugar si su socket anterior quedó colgado. Puede ser null. */
    final String resume;

    Peer(String id, Room room, PeerChannel channel, String resume) {
        this.id = id;
        this.room = room;
        this.channel = channel;
        this.resume = resume;
    }

    public String id() { return id; }

    public PeerChannel channel() { return channel; }
}
