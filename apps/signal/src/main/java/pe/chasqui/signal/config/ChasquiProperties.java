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

    public record Turn(String secret, List<String> urls, @DefaultValue("3600") long ttlSeconds) {
        public boolean enabled() {
            return secret != null && !secret.isBlank() && urls != null && !urls.isEmpty();
        }
    }
}
