package pe.chasqui.signal.room;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import pe.chasqui.signal.ratelimit.FixedWindowLimiter;

@Component
public class RoomSweeper {
    private final RoomRegistry registry;
    private final FixedWindowLimiter joinLimiter;

    public RoomSweeper(RoomRegistry registry, FixedWindowLimiter joinLimiter) {
        this.registry = registry;
        this.joinLimiter = joinLimiter;
    }

    @Scheduled(fixedDelayString = "${chasqui.sweep-interval-ms:30000}")
    public void sweep() {
        registry.sweep();
        joinLimiter.sweep();
    }
}
