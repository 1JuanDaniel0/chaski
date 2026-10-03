package pe.chasqui.signal.metrics;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.stereotype.Component;

/** Contadores de Micrometer. Nunca se etiqueta con IP ni roomId. */
@Component
public class SignalMetrics {
    private final MeterRegistry registry;
    private final Counter roomsCreated;
    private final Counter roomsPaired;
    private final Counter connections;

    public SignalMetrics(MeterRegistry registry) {
        this.registry = registry;
        this.roomsCreated = Counter.builder("chasqui.rooms.created").register(registry);
        this.roomsPaired = Counter.builder("chasqui.rooms.paired").register(registry);
        this.connections = Counter.builder("chasqui.connections").register(registry);
    }

    public void roomCreated() { roomsCreated.increment(); }

    public void roomPaired() { roomsPaired.increment(); }

    public void connection() { connections.increment(); }

    /** route: host | srflx | relay | failed (conjunto cerrado, validado antes). */
    public void report(String route) {
        registry.counter("chasqui.reports", "route", route).increment();
    }

    public void error(String code) {
        registry.counter("chasqui.errors", "code", code).increment();
    }

    public void bindRooms(java.util.function.Supplier<Number> activeRooms) {
        io.micrometer.core.instrument.Gauge.builder("chasqui.rooms.active", activeRooms).register(registry);
    }
}
