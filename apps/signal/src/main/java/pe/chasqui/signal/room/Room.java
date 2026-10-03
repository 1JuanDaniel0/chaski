package pe.chasqui.signal.room;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** Estado de una sala. Las mutaciones ocurren bajo el candado del RoomRegistry. */
final class Room {
    final String id;
    final long createdAt;
    final Map<String, Peer> peers = new ConcurrentHashMap<>();
    volatile String ownerId;
    volatile long lastActivity;
    /** Desde cuándo la sala tiene un solo dispositivo. */
    volatile long singleSince;
    volatile boolean expired;

    Room(String id, long now) {
        this.id = id;
        this.createdAt = now;
        this.lastActivity = now;
        this.singleSince = now;
    }

    List<String> peerIds() {
        return List.copyOf(peers.keySet());
    }
}
