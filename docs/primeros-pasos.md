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
- [ ] Prueba: `curl -I https://signal.<dominio>` y abre `app.<dominio>` en dos dispositivos.

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
