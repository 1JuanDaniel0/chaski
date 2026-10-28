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
    private final Counter resumed;
    private final Counter codesOpened;
    private final Counter codesPaired;

    public SignalMetrics(MeterRegistry registry) {
        this.registry = registry;
        this.roomsCreated = Counter.builder("chasqui.rooms.created").register(registry);
        this.roomsPaired = Counter.builder("chasqui.rooms.paired").register(registry);
        this.connections = Counter.builder("chasqui.connections").register(registry);
        this.resumed = Counter.builder("chasqui.peers.resumed").register(registry);
        this.codesOpened = Counter.builder("chasqui.codes.opened").register(registry);
        this.codesPaired = Counter.builder("chasqui.codes.paired").register(registry);
    }

    public void roomCreated() { roomsCreated.increment(); }

    public void roomPaired() { roomsPaired.increment(); }

    public void connection() { connections.increment(); }

    /** Un dispositivo volvió a la sala y reemplazó su socket anterior. */
    public void resumed() { resumed.increment(); }

    /** Una PC mostró un código (RF6). */
    public void codeOpened() { codesOpened.increment(); }

    /** Alguien escribió un código vigente (no dice si acertó: eso solo lo saben los dos clientes). */
    public void codePaired() { codesPaired.increment(); }

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
