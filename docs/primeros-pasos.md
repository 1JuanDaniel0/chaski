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

> **Producción corre en Oracle Cloud (Santiago) desde el 2026-10-15** (ver [ADR 0005](adr/0005-oracle-cloudflare-hosting.md)). Esta sección sirve para recrear la VM. Si alguna vez hay que usar AWS, los pasos equivalen: instancia EC2 con Ubuntu, Elastic IP en vez de IP reservada y Security Group con los mismos puertos de la tabla.

**Límites Always Free que importan** (según la página *Recursos Siempre gratis* de Oracle en octubre de 2026; en la consola están en *Gobernanza y administración, Límites, cuotas y uso*):

| Recurso | Gratis por cuenta | Chaski usa | Queda para otros proyectos |
|---------|-------------------|------------|----------------------------|
| Ampere A1 (VM.Standard.A1.Flex) | 2 OCPU y 12 GB de RAM en total (1.500 OCPU-hora y 9.000 GB-hora al mes) | 1 OCPU y 6 GB | 1 OCPU y 6 GB |
| Disco (boot + block, en conjunto) | 200 GB (boot mínimo de 47 GB) | 50 GB de boot | 150 GB |
| Salida de datos a internet | 10 TB al mes | Lo que pase por TURN | Compartido |
| VM AMD (VM.Standard.E2.1.Micro) | 2 VM de 1/8 OCPU y 1 GB | Nada | 2 |

- Desde junio de 2026 el A1 gratis bajó de 4 OCPU y 24 GB a 2 OCPU y 12 GB. La documentación dice que **todas** las cuentas, gratuitas o de pago, tienen 1.500 OCPU-hora y 9.000 GB-hora al mes, aunque la lista de precios todavía habla de 3.000 y 18.000 para cuentas de pago. **No pases de 2 OCPU y 12 GB entre todas tus VM A1.**
- Lo gratis solo existe en la **región de origen** (home region), la que se eligió al crear la cuenta y que no se puede cambiar. La de Chaski es **Santiago** (`sa-santiago-1`), más cerca de Lima que el São Paulo de AWS, así que el relevo debería tener menos latencia. Santiago tiene un solo dominio de disponibilidad: si sale "Out of capacity" no hay otro al que cambiar, solo reintentar más tarde.
- Oracle puede reclamar VM Always Free inactivas (CPU en el percentil 95, red y memoria por debajo del 20% durante 7 días), y Chaski casi siempre lo parecería. La página no lo aclara, pero según correos de Oracle citados en foros no aplica a cuentas Pay As You Go (PAYG), como la de Chaski. Si llega un aviso de reclamación, hay que tomarlo en serio. A cambio, todo lo que pase de Always Free **se cobra en la tarjeta**; Oracle recomienda cuotas de compartimento para controlarlo ([11.1](#111-presupuesto-y-cuota)). En la consola, lo gratis lleva la etiqueta *Always Free-eligible*: si al crear algo no la ves, para.
- El ancho de banda del A1 es de 1 Gbps por OCPU, así que 1 OCPU basta para TURN.

Pasos:

- [ ] Crea la cuenta de Oracle Cloud y pásala a Pay As You Go (ya hecho).
- [ ] En *Identity, Compartments*, crea el compartimento `chaski` y crea todo lo de abajo dentro de él. Así la cuota del [paso 11.1](#111-presupuesto-y-cuota) limita solo a Chaski y no a tus otros proyectos.
- [ ] Crea una instancia **Ampere A1** (`VM.Standard.A1.Flex`) con **1 OCPU y 6 GB de RAM**, imagen *Canonical Ubuntu 24.04* (aarch64) y boot volume de **50 GB** con rendimiento *Balanced* (más VPU se cobra). Si sale "Out of capacity", vuelve a intentarlo más tarde.
- [ ] Sube tu llave SSH pública al crearla.
- [ ] Deja que el asistente cree la VCN con subred pública. Después, en la VNIC de la VM, cambia la IP pública efímera por una **IP pública reservada** (*Reserved public IP*), así no cambia si recreas la VM.
- [ ] En la VCN, edita la **Security List** de la subred pública (reglas *stateful*, de entrada) y abre:

| Puerto | Protocolo | Origen |
|--------|-----------|--------|
| 22 | TCP | Tu IP (o 0.0.0.0/0 si no queda otra) |
| 3478 | TCP y UDP | 0.0.0.0/0 |
| 443 | TCP | 0.0.0.0/0 |
| 49160-49360 | UDP | 0.0.0.0/0 |
| 8443 | TCP | Rangos de Cloudflare (https://www.cloudflare.com/ips-v4), una regla por rango |

- [ ] Entra por SSH (`ubuntu@<IP>`) y clona el repo en `~/chasqui`. El repo es privado y el `git clone` por HTTPS no funciona sin token, así que usa una **deploy key** de solo lectura:
  1. En la VM: `ssh-keygen -t ed25519 -f ~/.ssh/github_deploy -N ""` y `cat ~/.ssh/github_deploy.pub`.
  2. En GitHub, *Settings, Deploy keys, Add deploy key*, pega la llave pública y deja **sin** marcar "Allow write access".
  3. En la VM, agrega a `~/.ssh/config`:
     ```
     Host github.com
       IdentityFile ~/.ssh/github_deploy
       IdentitiesOnly yes
     ```
  4. `git clone git@github.com:1JuanDaniel0/chasqui.git ~/chasqui`. Así `git pull` y `deploy.sh` funcionan sin contraseña.
- [ ] Ejecuta `sudo infra/scripts/provision-vm.sh`. Instala Docker y abre el firewall del sistema operativo: en Oracle, **el Ubuntu trae iptables con un REJECT por defecto**, así que sin este script nada llega a coturn aunque la Security List esté bien. Ojo: Docker publica el 8443 con NAT y ese tráfico no pasa por la cadena `INPUT`, así que **quien deja el 8443 solo para Cloudflare es la Security List**; no lo abras ahí a 0.0.0.0/0. Para ver si llegan conexiones al 8443, mira la cadena de Docker: `sudo iptables -L DOCKER -n -v -x | grep dpt:8443`.
- [ ] Anota la IP pública y la privada (`ip a`, suele ser `10.0.0.x`) para `TURN_EXTERNAL_IP`.

## 4. DNS en Cloudflare

| Registro | Tipo | Destino | Proxy |
|----------|------|---------|-------|
| `app` | CNAME | Tu proyecto de Cloudflare Pages (`<proyecto>.pages.dev`), lo crea Pages al añadir el dominio | Activado (nube naranja) |
| `signal` | A | IP pública reservada de la VM | **Activado** |
| `turn` | A | IP pública reservada de la VM | **Desactivado** (solo DNS, nube gris) |

- [ ] En Pages: conecta el repo, directorio raíz `apps/web`, comando `pnpm build`, salida `dist`, y añade el dominio personalizado `app.<dominio>`.
- [ ] En SSL/TLS de Cloudflare pon el modo **Full (strict)**.
- [ ] **Origin Rule** para la señalización: el navegador entra por el 443, pero en la VM el 443 es de coturn y la señalización escucha en el 8443. En Cloudflare, Rules, Origin Rules, Create rule: `Hostname` igual a `signal.<dominio>`, y en **Destination Port** elige *Rewrite to* `8443`. Sin esta regla la app muestra "Sin conexión con el servidor".
- [ ] **Buscadores.** La web ya trae `robots.txt`, `sitemap.xml`, `canonical` a `https://chaski.me/` y JSON-LD. Falta, desde las cuentas del dueño del dominio:
  - [ ] [Google Search Console](https://search.google.com/search-console): propiedad de tipo **Dominio**, verificada con el registro TXT que pide, añadido en el DNS de Cloudflare. Luego, en Sitemaps, envía `https://chaski.me/sitemap.xml`.
    Si en una propiedad nueva sale "No se ha podido obtener", suele ser temporal: confírmalo con "Inspeccionar URL" sobre el sitemap y "Probar URL publicada". Si la prueba pasa, solo hay que esperar o volver a enviarlo. El favicon recién aparece en los resultados cuando Google rastrea la portada.
  - [ ] [Bing Webmaster Tools](https://www.bing.com/webmasters): "Importar desde Google Search Console" trae el sitio y el sitemap. Bing también alimenta DuckDuckGo y Yahoo.
  - [ ] En Cloudflare, Caching, Configuration: activa **Crawler Hints**, que avisa a Bing por IndexNow cuando cambia algo.
  - [ ] Redirige `app.<dominio>` a `https://<dominio>/` con una Redirect Rule (301, conservando ruta y query) para que los buscadores vean una sola dirección.

## 5. Certificado de origen para la señalización (8443)

- [ ] En Cloudflare: SSL/TLS, Origin Server, "Create Certificate" para `signal.<dominio>` (o `*.<dominio>`). Descarga el `.pem` y la llave.
- [ ] En la VM, guárdalos como `~/chasqui/infra/certs/origin/origin.pem` y `origin.key`. El contenedor de la señalización corre con el usuario 10001, así que la llave tiene que ser suya: `sudo chown 10001:10001 infra/certs/origin/origin.key && sudo chmod 400 infra/certs/origin/origin.key`. Si no, la señalización se reinicia en bucle con `AccessDeniedException: /certs/origin/origin.key`.
- [ ] Confirma que `apps/signal` lee el certificado como indica `infra/docker-compose.yml` (propiedades `SERVER_SSL_*`).

## 6. Certificado Let's Encrypt para TURN

- [ ] En Cloudflare crea un API token con permiso **Zone: DNS: Edit** solo para tu zona.
- [ ] En la VM crea `/etc/letsencrypt/cloudflare.ini` con `dns_cloudflare_api_token = <token>` y `chmod 600`.
- [ ] Ejecuta `sudo infra/scripts/renew-turn-cert.sh` (la primera vez fallará el reinicio de coturn si aún no está levantado; es normal).
- [ ] Programa la renovación: una entrada de cron semanal con ese script.

## 7. Configurar y arrancar

- [ ] `cp infra/.env.example infra/.env` y rellena `TURN_SECRET` (`openssl rand -hex 32`), `TURN_EXTERNAL_IP` y `SIGNAL_TAG`.
- [ ] Ajusta `TURN_MONTHLY_GB` en `infra/.env`: los GB que pueden salir de la VM al mes antes de apagar el relevo (50 por defecto; en Oracle, con 10 TB gratis, puede ser mucho más). `deploy.sh` instala la revisión en cron. Para ver lo gastado: `infra/scripts/turn-budget.sh --status`.
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
| 2026-10-15 | PC Windows | Android, Chrome, datos móviles | OK (script de humo), ya en Oracle | relay OK en 3478 UDP/TCP y TURNS 443, IP de la VM de Oracle | Sin verificar (archivos pequeños) | Primera prueba tras la mudanza a Oracle. 65 KB y 43 KB en ambos sentidos OK. Con archivos tan pequeños lo normal es la ruta directa, así que no prueba el relevo en la app |

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
- [ ] **Métricas de un lanzamiento.** La web no lleva analítica ni scripts de terceros, así que cada canal (Reddit, Show HN…) se mide publicando en días distintos y comparando el día. A medianoche (hora de Lima) la señalización escribe una línea con lo de ese día: salas creadas y emparejadas, reconexiones y cuántas conexiones fueron directas (`host`, `srflx`) o por el relevo (`relay`). En la VM: `docker compose logs signal | grep "resumen diario"`. Los logs se pierden al redesplegar, así que anota los números antes de un `deploy.sh`. Para las visitas de buscadores, Search Console.

## 11. Mudanza de AWS a Oracle

> Hecha el 2026-10-15 (DNS apuntando a Oracle desde ese día). Queda la [sección 11.5](#115-apagar-aws).

La idea es montar la VM de Oracle **al lado** de la de AWS, probarla sin tocar a los usuarios y recién después cambiar el DNS. Como las dos usan el mismo `TURN_SECRET`, las credenciales que da cualquiera de las dos señalizaciones sirven en los dos coturn, así que durante el cambio nadie se queda sin relevo. El frontend (Cloudflare Pages) no se mueve.

Dos cosas que cambian con Oracle:
- **Costo del relevo.** Oracle regala 10 TB de salida al mes, frente a los ~0,09 USD/GB de AWS, así que el tope `TURN_MONTHLY_GB` sube de 50 a 5000 GB sin pagar nada. Pasados los 10 TB se cobra por GB (mira la lista de precios de Oracle).
- **Latencia del relevo.** coturn sigue en la VM, así que el relevo pasa de São Paulo a Santiago.

### 11.1 Presupuesto y cuota

Equivalen al AWS Budget de 30 USD y sirven para que Chaski no se coma el Always Free de otros proyectos.

- [ ] **Presupuesto.** *Billing & Cost Management, Budgets, Create budget*: alcance la **tenencia completa** (compartimento raíz, para enterarte de cualquier cobro), mensual, monto 5 USD. Reglas de alerta a tu correo:
  - Gasto **real** mayor o igual a **0,01 USD** (monto absoluto): avisa del primer centavo que se cobre. La meta es 0.
  - Gasto real al 100%.
  - Gasto **pronosticado** al 100% (necesita unos 3 días de consumo para calcularse).
- [ ] Igual que en AWS, el presupuesto **solo avisa**, no apaga nada. Oracle permite cortar con una función (*Zero Quota Policy Creator*), pero apagaría Chaski de golpe; no lo pongas por ahora.
- [ ] **Cuota del compartimento.** *Governance, Quota Policies, Create*, en el compartimento raíz:

```
set compute-core quota standard-a1-core-count to 1 in compartment chaski
set compute-memory quota standard-a1-memory-count to 6 in compartment chaski
set block-storage quota total-storage-gb to 60 in compartment chaski
```

  Así nada dentro de `chaski` puede pasar de 1 OCPU, 6 GB y 60 GB de disco, y la otra mitad del Always Free queda libre. Si la consola no reconoce un nombre, búscalo en *Limits, Quotas and Usage* (servicio Compute, familia `Standard A1`).
- [ ] Al día siguiente de crear la VM, mira *Cost Analysis*: debe salir 0. Si sale algo (por ejemplo, la IP reservada o el boot volume), revisa qué es antes de seguir.

### 11.2 Montar la VM nueva

- [ ] Haz la [sección 3](#3-cuenta-de-oracle-y-vm) completa en Oracle.
- [ ] Copia de la VM de AWS a la de Oracle, sin cambiar nada en AWS (por ejemplo con `scp` pasando por tu PC):
  - `~/chasqui/infra/.env`: copia `TURN_SECRET` y `SIGNAL_TAG` tal cual, cambia `TURN_EXTERNAL_IP` por `IPpúblicaOracle/IPprivadaOracle` y sube `TURN_MONTHLY_GB` a **5000**. Son 5 TB, la mitad de los 10 TB gratis de salida, que se comparten con las otras VM de la cuenta. El contador empieza de cero en la VM nueva.
  - `~/chasqui/infra/certs/origin/origin.pem` y `origin.key` (con el dueño y los permisos que pide la [sección 5](#5-certificado-de-origen-para-la-señalización-8443)), o crea otro certificado de origen en Cloudflare.
  - `/etc/letsencrypt/cloudflare.ini` (`chmod 600`).
- [ ] Certificado de TURN: `sudo infra/scripts/renew-turn-cert.sh`. Usa el desafío DNS, así que funciona aunque `turn.` todavía apunte a AWS.
- [ ] Programa la renovación: `sudo crontab -e` y agrega `0 4 * * 1 /home/ubuntu/chasqui/infra/scripts/renew-turn-cert.sh`.
- [ ] Si el paquete de GHCR es privado: `docker login ghcr.io` con un token de solo lectura.
- [ ] Arranca: `cd ~/chasqui && infra/scripts/deploy.sh`.

### 11.3 Probar antes del cambio

- [ ] En la VM de Oracle: `docker compose -f infra/docker-compose.yml ps` (los dos `Up`) y `curl -s localhost:9090/actuator/health` (`UP`).
- [ ] Tope de salida: `crontab -l` debe mostrar la línea de `turn-budget.sh` que pone `deploy.sh`, e `infra/scripts/turn-budget.sh --status` debe decir "… GB de 5000 GB". El script toma sola la interfaz de salida (`ip route show default`).
- [ ] Desde tu PC, saca credenciales de producción: `node infra/scripts/smoke-signal.mjs wss://signal.chaski.me/ws https://chaski.me`.
- [ ] En [Trickle ICE](https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/), con esas credenciales y política "relay", prueba `turn:<IP pública de Oracle>:3478?transport=udp` y `?transport=tcp`. Debe salir un candidato `relay` con la IP de Oracle. Si no sale nada, revisa los dos firewalls (Security List y `sudo iptables -L INPUT -n`) y `TURN_EXTERNAL_IP`.

### 11.4 Cambio de DNS

- [ ] Un día antes, en Cloudflare, baja el TTL del registro `turn` (nube gris) a **1 min**. El de `signal` tiene proxy y cambia al instante.
- [ ] El día del cambio, edita los dos registros A, `signal` y `turn`, con la IP reservada de Oracle. No toques nada más del DNS.
- [ ] En GitHub (*Settings, Secrets and variables, Actions*), cambia `VM_HOST` por la IP de Oracle y agrega la llave pública de `VM_SSH_KEY` a `~/.ssh/authorized_keys` de la VM de Oracle. `VM_USER` sigue siendo `ubuntu`.
- [ ] Haz la [prueba de punta a punta](#prueba-de-punta-a-punta) completa (script de humo, Trickle ICE con `turns:turn.chaski.me:443` y una transferencia real por datos móviles) y anótala en la tabla.
- [ ] Las salas que estaban abiertas en AWS se reconectan solas a la señalización nueva, y los relevos que ya estaban en curso siguen por el coturn de AWS hasta terminar. Por eso AWS se queda encendido un par de días.
- [ ] Cuando lleve un par de días estable, devuelve el TTL de `turn` a *Auto*.

Para volver atrás: pon otra vez la IP de AWS en los dos registros y en `VM_HOST`.

### 11.5 Apagar AWS

Espera 2 días con Oracle funcionando y sin quejas.

- [ ] En la VM de AWS, anota los últimos números del resumen diario (`docker compose -f infra/docker-compose.yml logs signal | grep "resumen diario"`) y confirma que coturn ya no abre sesiones nuevas (`docker compose -f infra/docker-compose.yml logs --since 24h coturn`).
- [ ] `cd ~/chasqui/infra && docker compose down`.
- [ ] En la consola de EC2 (São Paulo): **Stop** la instancia. Si en unos días nada falla, **Terminate**.
- [ ] **Elastic IP: Disassociate y luego Release.** Una IP elástica sin instancia se cobra por hora.
- [ ] En *Volumes* y *Snapshots*, borra lo que haya quedado de Chaski (el disco raíz se borra solo al terminar la instancia si tenía *Delete on termination*).
- [ ] Borra el Security Group de Chaski (no cuesta, es por orden).
- [ ] En GitHub, *Settings, Deploy keys*: borra la llave de la VM de AWS.
- [ ] Borra las copias temporales de llaves y secretos que se usaron para pasar archivos entre las VM y tu PC.
- [ ] Deja el AWS Budget `chasqui-consumo-mensual` hasta que la factura del mes siguiente salga en 0 USD. Si sale algo, *Cost Explorer* agrupado por servicio dice qué quedó vivo.
