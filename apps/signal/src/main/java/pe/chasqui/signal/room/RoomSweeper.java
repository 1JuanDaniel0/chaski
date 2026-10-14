package pe.chasqui.signal.room;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import pe.chasqui.signal.ratelimit.FixedWindowLimiter;
import pe.chasqui.signal.turn.TurnCredentials;

@Component
public class RoomSweeper {
    private final RoomRegistry registry;
    private final FixedWindowLimiter joinLimiter;
    private final TurnCredentials turn;

    public RoomSweeper(RoomRegistry registry, FixedWindowLimiter joinLimiter, TurnCredentials turn) {
        this.registry = registry;
        this.joinLimiter = joinLimiter;
        this.turn = turn;
    }

    @Scheduled(fixedDelayString = "${chasqui.sweep-interval-ms:30000}")
    public void sweep() {
        registry.sweep();
        joinLimiter.sweep();
        turn.sweep();
    }
}
