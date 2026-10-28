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
        @DefaultValue Turn turn,
        @DefaultValue Code code) {

    /** {@code perIpPerDay}: credenciales TURN por IP al día; pasado eso la sala funciona solo con conexión directa. */
    public record Turn(String secret, List<String> urls, @DefaultValue("3600") long ttlSeconds,
                       @DefaultValue("100") int perIpPerDay) {
        public boolean enabled() {
            return secret != null && !secret.isBlank() && urls != null && !urls.isEmpty();
        }
    }

    /**
     * Emparejar por código (RF6, protocolo §9). {@code slots}: casilleros posibles (100 = dos dígitos);
     * {@code openTtl}: cuánto espera un código sin que nadie lo escriba; {@code pairedTtl}: tope para terminar
     * CPace una vez emparejados; {@code maxPake}: mensajes {@code pake} por lado.
     */
    public record Code(@DefaultValue("100") int slots, @DefaultValue("120s") Duration openTtl,
                       @DefaultValue("30s") Duration pairedTtl, @DefaultValue("2") int maxPake) {}
}
