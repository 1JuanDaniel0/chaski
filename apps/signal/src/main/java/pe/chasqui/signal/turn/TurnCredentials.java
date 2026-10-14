package pe.chasqui.signal.turn;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.time.Clock;
import java.util.Base64;
import java.util.Optional;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.stereotype.Component;
import pe.chasqui.signal.config.ChasquiProperties;
import pe.chasqui.signal.ratelimit.FixedWindowLimiter;

/** Credenciales temporales "TURN REST API" de coturn (protocolo §7). */
@Component
public class TurnCredentials {
    private static final String HMAC = "HmacSHA1";
    private final ChasquiProperties.Turn config;
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();
    /** Freno al abuso del relevo: el tope de gasto del mes lo pone la VM (infra/scripts/turn-budget.sh). */
    private final FixedWindowLimiter perIp;

    public TurnCredentials(ChasquiProperties props, Clock clock) {
        this.config = props.turn();
        this.clock = clock;
        this.perIp = new FixedWindowLimiter(config.perIpPerDay(), 86_400_000L, clock);
    }

    /**
     * Vacío si no hay TURN_SECRET (o TURN_URLS), o si esa IP ya recibió {@code perIpPerDay} credenciales hoy:
     * el servidor omite {@code turn} y la sala solo puede conectarse directo.
     */
    public Optional<TurnInfo> issue(String ip) {
        if (!config.enabled() || !perIp.tryAcquire(ip)) {
            return Optional.empty();
        }
        byte[] rnd = new byte[8];
        random.nextBytes(rnd);
        long exp = clock.instant().getEpochSecond() + config.ttlSeconds();
        String username = username(exp, rnd);
        return Optional.of(new TurnInfo(config.urls(), username, credentialFor(username), config.ttlSeconds()));
    }

    /** Elimina ventanas vencidas del límite por IP. */
    public void sweep() {
        perIp.sweep();
    }

    public static String username(long expEpochSeconds, byte[] random8) {
        return expEpochSeconds + ":" + Base64.getUrlEncoder().withoutPadding().encodeToString(random8);
    }

    public String credentialFor(String username) {
        try {
            Mac mac = Mac.getInstance(HMAC);
            mac.init(new SecretKeySpec(config.secret().getBytes(StandardCharsets.UTF_8), HMAC));
            return Base64.getEncoder().encodeToString(mac.doFinal(username.getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }
}
