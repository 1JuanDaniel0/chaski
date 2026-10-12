package pe.chasqui.signal.metrics;

import static org.assertj.core.api.Assertions.assertThat;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;

class DailySummaryTest {

    @Test
    void cuentaSoloLoDelDia() {
        var registry = new SimpleMeterRegistry();
        var metrics = new SignalMetrics(registry);
        var summary = new DailySummary(registry);

        metrics.roomCreated();
        metrics.roomCreated();
        metrics.roomPaired();
        metrics.report("relay");
        var first = summary.summary();
        assertThat(first).containsEntry("salas_creadas", 2L).containsEntry("salas_emparejadas", 1L)
                .containsEntry("ruta_relay", 1L).containsEntry("ruta_host", 0L);

        metrics.roomCreated();
        var second = summary.summary();
        assertThat(second).containsEntry("salas_creadas", 1L).containsEntry("salas_emparejadas", 0L)
                .containsEntry("ruta_relay", 0L);
    }
}
