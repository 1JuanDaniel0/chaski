# Modelo de amenazas

El cifrado resuelve el tránsito. Los riesgos reales están en el código que sirve la web, el abuso del relevo TURN y la PC de destino, que Chasqui no controla.

## Amenazas y mitigaciones

| Amenaza | Mitigación | Riesgo residual |
|---------|------------|-----------------|
| Servidor de señalización comprometido intenta MITM | Señalización cifrada y autenticada con `k_sig` (AES-GCM con AAD) | Bajo |
| Atacante en la misma red (Wi-Fi pública) | DTLS en el canal de datos, TLS en la web y la señalización | Bajo |
| Alguien fotografía el QR | Sala de máximo 2 dispositivos; la PC muestra quién se conectó y puede expulsarlo; el QR expira a los 10 min sin uso | Medio-bajo |
| Intruso con el QR aprovecha una reconexión | Cada lado fija la huella DTLS del otro y rechaza renegociaciones con otra; volver a la sala usa un token `resume` que solo conoce cada dispositivo | Bajo: puede estorbar la reconexión, no tomar la sesión |
| Archivo malicioso | Nada se abre solo; aviso en extensiones ejecutables; nombres saneados (caracteres de control y truco RTLO) | Bajo |
| XSS vía texto o nombre de archivo | Todo se muestra como texto (prohibido `dangerouslySetInnerHTML`) + CSP estricta | Bajo |
| Código del frontend alterado (servidor o dependencia npm) | Sin scripts de terceros, dependencias mínimas y fijadas, Dependabot, código abierto | Medio: limitación conocida del cifrado en web |
| TURN usado como proxy hacia redes internas (SSRF) | Credenciales temporales y `denied-peer-ip` para rangos privados y de metadatos de la nube | Bajo |
| Agotar los puertos de relevo de coturn (CVE-2026-73215) | coturn 4.18.0 (corregido desde 4.17.0); versión fija en `docker-compose.yml` | Bajo |
| TURN usado para gastar ancho de banda (costo de salida de la VM) | Credenciales temporales, como máximo 100 por IP al día; `user-quota` y `total-quota`; tope duro mensual que apaga coturn al pasar `TURN_MONTHLY_GB` (`infra/scripts/turn-budget.sh`). Sin `max-bps` ni `bps-capacity`, que hundían las transferencias por relevo ([ADR 0006](adr/0006-relevo-sin-tope-y-costo.md)) | Bajo: lo peor es perder el relevo hasta fin de mes |
| Inundación de la señalización (DoS) | Cloudflare delante, límites por IP y por conexión, 8443 solo abierto a rangos de Cloudflare | Medio |
| Secuestro de WebSocket entre sitios (CSWSH) | Validación de `Origin` en el handshake | Bajo |
| Distribución de malware con enlaces públicos | No hay enlaces persistentes: solo dos dispositivos conectados en vivo | Bajo |
| PC de destino con monitoreo o antivirus | Fuera de alcance; la interfaz lo dice: el cifrado protege el trayecto, no la PC | Aceptado |

Firefox Send cerró en 2020 porque sus enlaces se usaban para repartir malware. Sin enlaces persistentes, ese vector casi desaparece.

## Riesgos residuales

- **Frontend servido por la misma entidad que lo audita.** Si alguien compromete Cloudflare Pages o una dependencia npm, puede servir JavaScript que lea `location.hash`. Por eso: sin terceros, dependencias mínimas, código abierto y CSP.
- **QR visible.** Quien lo vea o fotografíe mientras la sala está abierta y sin segundo dispositivo podría unirse primero. El usuario ve quién se conectó y puede expulsarlo.
- **Metadatos.** Cada dispositivo ve la IP del otro (así funciona WebRTC). El servidor de señalización y TURN ven IPs y tamaños aproximados de tráfico. Los logs no guardan IPs ni `roomId`.
- **Abuso de TURN y costo de salida.** Mitigado con cuotas, límite de credenciales por IP y un tope mensual que apaga el relevo.
- **Proxies con inspección TLS** pueden bloquear incluso TURN sobre 443.
- **Dependencia del proveedor de la VM (hoy AWS) y de Cloudflare** para disponibilidad (el contenido sigue cifrado aunque fallen).
- **PC de destino:** cualquier cosa que ocurra en ella queda fuera de lo que Chasqui puede proteger. Se recomienda borrar lo descargado al terminar.

Fuera de alcance del cifrado: Chasqui no oculta que dos IPs se conectaron entre sí. En el futuro, el modo mostrador ofrecerá `iceTransportPolicy: "relay"` para ocultar la IP del otro lado.
