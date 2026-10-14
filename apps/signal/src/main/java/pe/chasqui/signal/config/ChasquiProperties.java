package pe.chasqui.signal.config;

import java.time.Duration;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/** Propiedades {@code chasqui.*}; los valores por defecto viven en application.yml. */
@ConfigurationProperties("chasqui")
public record ChasquiProperties(
        List<String> allowedOrigins,
        int maxFrameBytes,
        int maxPeersPerRoom,
        int joinPerIpPerMinute,
        int messagesPerSecond,
        Duration singlePeerTtl,
        Duration inactivityTtl,
        long sweepIntervalMs,
        @DefaultValue Turn turn) {

    /** {@code perIpPerDay}: credenciales TURN por IP al día; pasado eso la sala funciona solo con conexión directa. */
    public record Turn(String secret, List<String> urls, @DefaultValue("3600") long ttlSeconds,
                       @DefaultValue("100") int perIpPerDay) {
        public boolean enabled() {
            return secret != null && !secret.isBlank() && urls != null && !urls.isEmpty();
        }
    }
}
