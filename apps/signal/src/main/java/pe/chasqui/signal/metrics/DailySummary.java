package pe.chasqui.signal.metrics;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Una línea de log al día con los contadores de {@link SignalMetrics} de ese día,
 * para comparar días de lanzamiento sin analítica en la web. Solo totales: nunca IPs ni salas.
 */
@Component
public class DailySummary {
    private static final Logger log = LoggerFactory.getLogger(DailySummary.class);
    private static final List<String> ROUTES = List.of("host", "srflx", "relay", "failed");

    private final MeterRegistry registry;
    private final Map<String, Double> last = new HashMap<>();

    public DailySummary(MeterRegistry registry) {
        this.registry = registry;
    }

    @Scheduled(cron = "0 0 0 * * *", zone = "America/Lima")
    public void logDay() {
        log.info("resumen diario {}", summary());
    }

    /** Lo sumado desde la llamada anterior (o desde el arranque). */
    Map<String, Long> summary() {
        Map<String, Long> day = new LinkedHashMap<>();
        day.put("salas_creadas", delta("chasqui.rooms.created", null));
        day.put("salas_emparejadas", delta("chasqui.rooms.paired", null));
        day.put("reconexiones", delta("chasqui.peers.resumed", null));
        for (String route : ROUTES) day.put("ruta_" + route, delta("chasqui.reports", route));
        return day;
    }

    private long delta(String name, String route) {
        var search = registry.find(name);
        if (route != null) search = search.tag("route", route);
        Counter counter = search.counter();
        double now = counter == null ? 0 : counter.count();
        Double before = last.put(name + ":" + route, now);
        return Math.round(now - (before == null ? 0 : before));
    }
}
