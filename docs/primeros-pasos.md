# Primeros pasos (lo que solo puedes hacer tú)

Checklist en orden. Reemplaza `chaski.me` por tu dominio real en: `infra/docker-compose.yml`, `infra/coturn/turnserver.conf`, `README.md` y las pruebas.

## 1. Prueba de red en el trabajo

- [ ] En la PC del trabajo abre [PairDrop](https://pairdrop.net) o [FilePizza](https://file.pizza) y transfiere un archivo desde tu celular con datos móviles.
- [ ] Abre `chrome://webrtc-internals` en la PC, mira los candidatos ICE y anota qué tipo ganó (`host`, `srflx` o `relay`).
- [ ] Anota el resultado: si solo funciona con `relay`, TURN sobre 443 será clave.

## 2. Dominio

- [ ] Verifica que haya un dominio libre para el nombre (alternativa: Pásalo).
- [ ] Cómpralo y, mejor, ponlo en Cloudflare como DNS (plan gratuito): "Add a site" y cambia los nameservers en tu registrador.

## 3. Cuenta de Oracle y VM

> **Hoy la VM está en AWS**, de forma temporal mientras dure el crédito (ver [ADR 0005](adr/0005-oracle-cloudflare-hosting.md)). En AWS los pasos equivalen: instancia EC2 con Ubuntu, Elastic IP en vez de IP reservada y Security Group con los mismos puertos de la tabla. `provision-vm.sh` instala Docker y agrega sus reglas igual, pero el Ubuntu de AWS acepta todo por defecto en iptables, así que **quien limita el 8443 a los rangos de Cloudflare es el Security Group**: no lo abras a 0.0.0.0/0. Para la IP privada de `TURN_EXTERNAL_IP` usa la de `ip a` en la instancia. Los pasos de abajo quedan para cuando se vuelva a Oracle.

- [ ] Crea la cuenta de Oracle Cloud (Always Free). Pide tarjeta para verificar identidad.
- [ ] Crea una instancia **Ampere A1** (ARM), Ubuntu 22.04 o 24.04, 2 OCPU y 12 GB de RAM sobran. Si sale "Out of capacity", prueba otro dominio de disponibilidad o más tarde.
- [ ] Sube tu llave SSH pública al crearla.
- [ ] Crea una **IP pública reservada** y asígnala a la VM (así no cambia si recreas la VM).
- [ ] En la VCN, edita la **Security List** (ingress) y abre:

| Puerto | Protocolo | Origen |
|--------|-----------|--------|
| 22 | TCP | Tu IP (o 0.0.0.0/0 si no queda otra) |
| 3478 | TCP y UDP | 0.0.0.0/0 |
| 443 | TCP | 0.0.0.0/0 |
| 49160-49360 | UDP | 0.0.0.0/0 |
| 8443 | TCP | Rangos de Cloudflare (https://www.cloudflare.com/ips-v4) |

- [ ] Entra por SSH, clona el repo en `~/chasqui` y ejecuta `sudo infra/scripts/provision-vm.sh` (instala Docker y abre el firewall del sistema operativo).
- [ ] Anota la IP pública y la privada (`ip a`) para `TURN_EXTERNAL_IP`.

## 4. DNS en Cloudflare

| Registro | Tipo | Destino | Proxy |
|----------|------|---------|-------|
| `app` | CNAME | Tu proyecto de Cloudflare Pages (`<proyecto>.pages.dev`), lo crea Pages al añadir el dominio | Activado (nube naranja) |
| `signal` | A | IP pública reservada de la VM | **Activado** |
| `turn` | A | IP pública reservada de la VM | **Desactivado** (solo DNS, nube gris) |

- [ ] En Pages: conecta el repo, directorio raíz `apps/web`, comando `pnpm build`, salida `dist`, y añade el dominio personalizado `app.<dominio>`.
- [ ] En SSL/TLS de Cloudflare pon el modo **Full (strict)**.
- [ ] **Origin Rule** para la señalización: el navegador entra por el 443, pero en la VM el 443 es de coturn y la señalización escucha en el 8443. En Cloudflare, Rules, Origin Rules, Create rule: `Hostname` igual a `signal.<dominio>`, y en **Destination Port** elige *Rewrite to* `8443`. Sin esta regla la app muestra "Sin conexión con el servidor".

## 5. Certificado de origen para la señalización (8443)

- [ ] En Cloudflare: SSL/TLS, Origin Server, "Create Certificate" para `signal.<dominio>` (o `*.<dominio>`). Descarga el `.pem` y la llave.
- [ ] En la VM, guárdalos como `~/chasqui/infra/certs/origin/origin.pem` y `origin.key` (`chmod 600 origin.key`).
- [ ] Confirma que `apps/signal` lee el certificado como indica `infra/docker-compose.yml` (propiedades `SERVER_SSL_*`).

## 6. Certificado Let's Encrypt para TURN

- [ ] En Cloudflare crea un API token con permiso **Zone: DNS: Edit** solo para tu zona.
- [ ] En la VM crea `/etc/letsencrypt/cloudflare.ini` con `dns_cloudflare_api_token = <token>` y `chmod 600`.
- [ ] Ejecuta `sudo infra/scripts/renew-turn-cert.sh` (la primera vez fallará el reinicio de coturn si aún no está levantado; es normal).
- [ ] Programa la renovación: una entrada de cron semanal con ese script.

## 7. Configurar y arrancar

- [ ] `cp infra/.env.example infra/.env` y rellena `TURN_SECRET` (`openssl rand -hex 32`), `TURN_EXTERNAL_IP` y `SIGNAL_TAG`.
- [ ] Primer despliegue: `infra/scripts/deploy.sh` (necesita que la imagen ya esté en GHCR: haz un push a `main` que toque `apps/signal`).
- [ ] En GitHub, vuelve el paquete `chasqui-signal` público, o haz `docker login ghcr.io` en la VM con un token de solo lectura.
- [ ] Prueba: `curl -I https://signal.<dominio>` y sigue la [prueba de punta a punta](#prueba-de-punta-a-punta).

### Prueba de punta a punta

Comprueba por separado la señalización, el relevo TURN y luego una transferencia real entre dos redes distintas (por ejemplo, la PC en el wifi de casa o del trabajo y el celular con datos móviles, sin wifi).

**1. Señalización (desde cualquier PC con Node 22):**

```bash
node infra/scripts/smoke-signal.mjs wss://signal.<dominio>/ws https://<dominio>
```

Abre dos WebSocket con el `Origin` indicado, los une a una sala nueva y comprueba `joined`, `peer-joined` y el reenvío de un `signal`. Al final imprime las credenciales TURN que entrega el servidor (duran `TURN_TTL_SECONDS`). Si falla al abrir, revisa que el origen esté en `ALLOWED_ORIGINS` y que el proxy de Cloudflare deje pasar WebSocket. Si avisa que `joined` no trae `turn`, faltan `TURN_SECRET` o `TURN_URLS`.

**2. TURN (en cada una de las dos redes):**

- [ ] Abre [Trickle ICE](https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/), borra el servidor por defecto y agrega cada URI que imprimió el script con su `username` y `credential`.
- [ ] Elige "relay" en "ICE Transport Policy" (así solo salen candidatos del relevo) y pulsa "Gather candidates".
- [ ] Debe aparecer al menos un candidato `relay` con la IP pública de la VM. Si `turn:...?transport=udp` no da nada pero `turns:...:443` sí, esa red bloquea UDP y el relevo por 443 es el que la salva.
- [ ] Si no aparece ningún `relay`: revisa el firewall de la nube (3478 TCP/UDP, 443 TCP, 49160-49360 UDP), que `TURN_EXTERNAL_IP` sea `IPpública/IPprivada` y que el certificado de `turn.<dominio>` no haya vencido.

**3. Transferencia real entre dos redes:**

- [ ] En la PC abre `https://<dominio>` y, en otra pestaña, `chrome://webrtc-internals`.
- [ ] Escanea el QR con el celular en datos móviles. Ambos deben mostrar "Conectado".
- [ ] Manda un archivo de unos MB y un texto en cada sentido.
- [ ] En `webrtc-internals`, busca el par de candidatos `succeeded` y `nominated` y anota el tipo local y remoto (`host`, `srflx` o `relay`).
- [ ] En la VM, mira qué rutas reportaron los clientes: `curl -s localhost:9090/actuator/prometheus | grep chasqui_reports`.

Si el par elegido es `srflx`, la conexión fue directa y TURN no se usó; es lo normal. Para que pase por el relevo, repite con una red que bloquee UDP (algunas redes corporativas o de universidad) o con datos móviles en ambos lados si el operador usa CGNAT.

**Resultados:** anota cada prueba aquí.

| Fecha | Red PC | Red celular | Señalización | TURN udp / tcp / tls | Ruta elegida | Notas |
|-------|--------|-------------|--------------|----------------------|--------------|-------|
| 2026-10-07 | PC Windows (wifi) | Android, Chrome, datos móviles 5G | OK (script de humo) | OK / OK / OK en ambas redes, relay 54.207.232.193 | Directa: `prflx` (PC) ↔ `srflx` (celular), UDP, RTT 36-230 ms | Foto y archivo en ambos sentidos OK. TURN no hizo falta en la app. El ICE pasó a `disconnected` y volvió a `connected` dos veces sin cortar la transferencia. Un aviso 701 en Trickle ICE de la PC no impidió los relay |

## 8. Secretos y entorno de GitHub

En Settings, Secrets and variables, Actions:

- [ ] `VM_HOST`: IP pública o `turn.<dominio>`.
- [ ] `VM_USER`: usuario SSH (por ejemplo `ubuntu`).
- [ ] `VM_SSH_KEY`: llave privada SSH **dedicada al despliegue** (genérala con `ssh-keygen -t ed25519`, agrega la pública a `~/.ssh/authorized_keys` de la VM).
- [ ] Settings, Environments: crea `production` (opcional: pide aprobación manual).

Sin estos secretos, el workflow `signal` construye y publica la imagen pero omite el despliegue.

## 9. Protección de `main`

Settings, Branches (o Rulesets), regla para `main`:

- [ ] Requerir pull request antes de mergear.
- [ ] Requerir que pasen los checks `web`, `signal` y `security`.
- [ ] Bloquear force-push y borrado.
- [ ] Settings, Code security: activar Dependabot alerts, secret scanning y push protection, y "Private vulnerability reporting" (para `SECURITY.md`).

## 10. Después

- [ ] Prototipo mínimo: dos pestañas en `localhost` que se pasan texto por WebRTC.
- [ ] Monitor de uptime externo gratuito para `app.` y `signal.`.
- [ ] Validar con unas 5 personas si prefieren escanear un QR antes que abrir WhatsApp Web.
