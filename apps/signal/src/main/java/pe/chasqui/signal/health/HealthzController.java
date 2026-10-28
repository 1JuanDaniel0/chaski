package pe.chasqui.signal.health;

import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Ruta pública para monitores de uptime: si responde, la VM, Docker y la señalización están arriba y Cloudflare
 * llega al 8443. A propósito no dice nada más (ni versión ni estado interno); el detalle sigue en Actuator,
 * que solo escucha en localhost.
 */
@RestController
public class HealthzController {
    @GetMapping("/healthz")
    ResponseEntity<String> healthz() {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .contentType(MediaType.TEXT_PLAIN)
                .body("ok");
    }
}
