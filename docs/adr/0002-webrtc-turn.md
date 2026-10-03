# ADR 0002: WebRTC directo con TURN de respaldo

## Contexto
Los archivos no deben almacenarse en ningún servidor y el contenido debe ir cifrado de extremo a extremo. El peor caso real es un celular con datos móviles y una PC en una red corporativa.

## Decisión
Transporte con `RTCDataChannel` (DTLS sobre SCTP). Conexión directa primero (ICE: host, srflx) y coturn propio como relevo (`relay`), incluyendo TURN sobre TLS en el puerto 443. Las credenciales TURN son temporales (TURN REST API).

## Alternativas
- Relevo propio por WebSocket: más simple, pero todo el tráfico pasaría siempre por el servidor. Queda como plan de respaldo si los proxies con inspección TLS bloquean TURN.
- TURN gestionado (Twilio, Metered, Cloudflare): cuesta dinero y enseña menos de redes.
- Guardar archivos cifrados temporalmente: rompe "nada se almacena" y reabre el abuso de enlaces.

## Consecuencias
- El servidor casi no gasta ancho de banda cuando la ruta es directa.
- Hace falta una VM con UDP y puertos abiertos, y configurar bien NAT 1:1 (`external-ip`) y bloqueos de rangos privados.
- Hipótesis a medir: menos del 30 % de las conexiones necesitarán TURN.
