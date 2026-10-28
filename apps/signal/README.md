# chasqui-signal

Servidor de señalización de Chasqui (Java 21, Spring Boot 3, WebSocket plano). Solo enruta
mensajes entre los dos dispositivos de una sala; el contrato está en `docs/protocol.md`.

## Ejecutar

```bash
mvn spring-boot:run          # ws://localhost:8443/ws
mvn verify                   # compila y corre todas las pruebas
docker build -t chasqui-signal .
```

## Variables de entorno

| Variable            | Por defecto                                   | Uso                                            |
|---------------------|-----------------------------------------------|------------------------------------------------|
| `PORT`              | `8443`                                        | Puerto HTTP/WebSocket                          |
| `ALLOWED_ORIGINS`   | `http://localhost:5173,http://127.0.0.1:5173` | Orígenes permitidos (coma); otros reciben 403  |
| `TURN_SECRET`       | (vacío)                                       | Si falta, `joined` no incluye `turn`           |
| `TURN_URLS`         | (vacío)                                       | URLs TURN separadas por coma                   |
| `TURN_TTL_SECONDS`  | `3600`                                        | Vida de las credenciales TURN                  |
| `TURN_PER_IP_PER_DAY` | `100`                                        | Credenciales TURN por IP al día; pasado eso, solo conexión directa |
| `MANAGEMENT_PORT`   | `9090`                                        | `/actuator/health` y `/actuator/prometheus`    |

`GET /healthz` (en el puerto principal) responde `200 ok` sin más detalle, para monitores de uptime.

Los demás límites (§6 del protocolo) son propiedades `chasqui.*` en `application.yml`.
Las métricas nunca llevan IP ni roomId como etiqueta, y el servidor no los registra en logs.
