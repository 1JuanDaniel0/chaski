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

> **Producción corre en Oracle Cloud (Santiago) desde el 2026-10-15** (ver [ADR 0005](adr/0005-oracle-cloudflare-hosting.md)). Esta sección sirve para recrear la VM.

**Límites Always Free que importan** (según la página *Recursos Siempre gratis* de Oracle en octubre de 2026; en la consola están en *Gobernanza y administración, Límites, cuotas y uso*):

| Recurso | Gratis por cuenta | Chaski usa | Queda para otros proyectos |
|---------|-------------------|------------|----------------------------|
| Ampere A1 (VM.Standard.A1.Flex) | 2 OCPU y 12 GB de RAM en total (1.500 OCPU-hora y 9.000 GB-hora al mes) | 1 OCPU y 6 GB | 1 OCPU y 6 GB |
| Disco (boot + block, en conjunto) | 200 GB (boot mínimo de 47 GB) | 50 GB de boot | 150 GB |
| Salida de datos a internet | 10 TB al mes | Lo que pase por TURN | Compartido |
| VM AMD (VM.Standard.E2.1.Micro) | 2 VM de 1/8 OCPU y 1 GB | Nada | 2 |

- Desde junio de 2026 el A1 gratis bajó de 4 OCPU y 24 GB a 2 OCPU y 12 GB. La documentación dice que **todas** las cuentas, gratuitas o de pago, tienen 1.500 OCPU-hora y 9.000 GB-hora al mes, aunque la lista de precios todavía habla de 3.000 y 18.000 para cuentas de pago. **No pases de 2 OCPU y 12 GB entre todas tus VM A1.**
- Lo gratis solo existe en la **región de origen** (home region), la que se eligió al crear la cuenta y que no se puede cambiar. La de Chaski es **Santiago** (`sa-santiago-1`), más cerca de Lima que São Paulo. Santiago tiene un solo dominio de disponibilidad: si sale "Out of capacity" no hay otro al que cambiar, solo reintentar más tarde.
- Oracle puede reclamar VM Always Free inactivas (CPU en el percentil 95, red y memoria por debajo del 20% durante 7 días), y Chaski casi siempre lo parecería. La página no lo aclara, pero según correos de Oracle citados en foros no aplica a cuentas Pay As You Go (PAYG), como la de Chaski. Si llega un aviso de reclamación, hay que tomarlo en serio. A cambio, todo lo que pase de Always Free **se cobra en la tarjeta**; Oracle recomienda cuotas de compartimento para controlarlo ([sección 11](#11-presupuesto-y-cuota-de-oracle)). En la consola, lo gratis lleva la etiqueta *Always Free-eligible*: si al crear algo no la ves, para.
- El ancho de banda del A1 es de 1 Gbps por OCPU, así que 1 OCPU basta para TURN.

Pasos:

- [ ] Crea la cuenta de Oracle Cloud y pásala a Pay As You Go (ya hecho).
- [ ] En *Identity, Compartments*, crea el compartimento `chaski` y crea todo lo de abajo dentro de él. Así la cuota de la [sección 11](#11-presupuesto-y-cuota-de-oracle) limita solo a Chaski y no a tus otros proyectos.
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

- [ ] Entra por SSH (`ubuntu@<IP>`) y clona el repo en `~/chasqui`: `git clone https://github.com/1JuanDaniel0/chasqui.git ~/chasqui`. El repo es público, así que `git pull` y `deploy.sh` funcionan sin token ni llave.
  Si el repo vuelve a ser privado, el clon por HTTPS deja de funcionar y hace falta una **deploy key** de solo lectura: `ssh-keygen -t ed25519 -f ~/.ssh/github_deploy -N ""` en la VM, la pública en GitHub (*Settings, Deploy keys*, **sin** "Allow write access"), un bloque `Host github.com` con `IdentityFile ~/.ssh/github_deploy` e `IdentitiesOnly yes` en `~/.ssh/config`, y clonar con `git@github.com:1JuanDaniel0/chasqui.git`.
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
| 2026-10-07 | PC Windows (wifi) | Android, Chrome, datos móviles 5G | OK (script de humo) | OK / OK / OK en ambas redes, relay con la IP de la VM de AWS de entonces | Directa: `prflx` (PC) ↔ `srflx` (celular), UDP, RTT 36-230 ms | Foto y archivo en ambos sentidos OK. TURN no hizo falta en la app. El ICE pasó a `disconnected` y volvió a `connected` dos veces sin cortar la transferencia. Un aviso 701 en Trickle ICE de la PC no impidió los relay |
| 2026-10-15 | PC Windows | Android, Chrome, datos móviles | OK (script de humo), ya en Oracle | relay OK en 3478 UDP/TCP y TURNS 443, IP de la VM de Oracle | Sin verificar (archivos pequeños) | Primera prueba tras la mudanza a Oracle. 65 KB y 43 KB en ambos sentidos OK. Con archivos tan pequeños lo normal es la ruta directa, así que no prueba el relevo en la app |

## 8. Despliegue automático

La VM se despliega sola: cada 5 minutos `infra/scripts/auto-deploy.sh` (lo pone en cron `deploy.sh`) trae `main` y, si el último commit cambió `apps/signal` o `infra/`, espera a que el workflow `signal` publique la imagen con ese SHA en GHCR y ejecuta `deploy.sh` con ella. Si solo cambió la web o los docs, avanza el repo y no reinicia nada. Así GitHub no entra a la VM y el puerto 22 puede seguir abierto solo para tu IP.

- [ ] Después del primer `deploy.sh`, `crontab -l` debe mostrar las líneas de `turn-budget.sh` y `auto-deploy.sh`.
- [ ] Tras mergear un cambio de la señalización, mira `tail infra/auto-deploy.log`: primero sale "esperando la imagen …" y, cuando el workflow termina, "desplegando …". Si se queda esperando, el job `image` de ese commit falló: arréglalo con otro merge.
- [ ] Rollback: lo normal es revertir el PR en GitHub y el automático despliega el revert. Para volver ya mismo: `SIGNAL_TAG=<sha completo del commit bueno> infra/scripts/deploy.sh`, pero con el próximo merge a `main` (sea lo que sea) el automático vuelve a la última imagen de `main`, así que revierte igual.
- [ ] Si antes usabas el deploy por SSH desde GitHub: borra los secretos `VM_HOST`, `VM_USER` y `VM_SSH_KEY`, el environment `production` y la llave pública de ese deploy en `~/.ssh/authorized_keys` de la VM.

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

## 11. Presupuesto y cuota de Oracle

Sirven para enterarte del primer cobro y para que Chaski no se coma el Always Free de otros proyectos.

- [ ] **Presupuesto.** *Billing & Cost Management, Budgets, Create budget*: alcance la **tenencia completa** (compartimento raíz, para enterarte de cualquier cobro), mensual, monto 5 USD. Reglas de alerta a tu correo:
  - Gasto **real** mayor o igual a **0,01 USD** (monto absoluto): avisa del primer centavo que se cobre. La meta es 0.
  - Gasto real al 100%.
  - Gasto **pronosticado** al 100% (necesita unos 3 días de consumo para calcularse).
- [ ] El presupuesto **solo avisa**, no apaga nada. Oracle permite cortar con una función (*Zero Quota Policy Creator*), pero apagaría Chaski de golpe; no lo pongas por ahora.
- [ ] **Cuota del compartimento.** *Governance, Quota Policies, Create*, en el compartimento raíz:

```
set compute-core quota standard-a1-core-count to 1 in compartment chaski
set compute-memory quota standard-a1-memory-count to 6 in compartment chaski
set block-storage quota total-storage-gb to 60 in compartment chaski
```

  Así nada dentro de `chaski` puede pasar de 1 OCPU, 6 GB y 60 GB de disco, y la otra mitad del Always Free queda libre. Si la consola no reconoce un nombre, búscalo en *Limits, Quotas and Usage* (servicio Compute, familia `Standard A1`).
- [ ] Al día siguiente de crear la VM, mira *Cost Analysis*: debe salir 0. Si sale algo (por ejemplo, la IP reservada o el boot volume), revisa qué es antes de seguir.

### Historial: mudanza de AWS a Oracle

Del 2026-10-07 al 2026-10-15 producción estuvo en una VM de AWS (São Paulo). La mudanza se hizo montando la VM de Oracle al lado, probándola con el script de humo y Trickle ICE, y cambiando después los registros `signal` y `turn` del DNS y el secreto `VM_HOST`. Las dos VM compartían `TURN_SECRET`, así que nadie se quedó sin relevo durante el cambio. AWS se borró el 2026-10-19. El paso a paso completo está en el historial de este archivo (PR #44 y #46).

## 12. Hacer público el repositorio

Revisado el 2026-10-19 antes de abrirlo: ni el código ni el historial de git tienen llaves, tokens, `.env` reales, correos personales ni la IP de la VM de Oracle (los autores usan correos `noreply`). La única IP pública del historial es la de la VM de AWS, que ya no existe.

- [ ] *Settings, General, Danger Zone, Change visibility*: **Public**.
- [ ] *Settings, Code security*: confirma que **secret scanning** y **push protection** quedaron activos (en repos públicos son gratis) y activa **Private vulnerability reporting**, que es lo que pide [SECURITY.md](../SECURITY.md).
- [ ] En *Actions*, mira que el workflow `security` ya no salga *skipped*: CodeQL y dependency review solo corren en repos públicos. Revisa lo que encuentre en *Security, Code scanning*.
- [ ] En la VM, pasa `origin` a HTTPS (`cd ~/chasqui && git remote set-url origin https://github.com/1JuanDaniel0/chasqui.git && git pull`) y recién después borra la deploy key en *Settings, Deploy keys*. Si la borras antes, `git pull` y el despliegue fallan.
- [ ] Panel *About* del repo (el engranaje): descripción corta, sitio `https://chaski.me` y temas (`webrtc`, `p2p`, `file-transfer`, `spring-boot`, `react`, `typescript`, `pwa`, `coturn`, `end-to-end-encryption`).
- [ ] *Settings, General, Social preview*: sube una imagen de 1280×640 (por ejemplo una captura de la portada) para que el enlace se vea bien al compartirlo.
- [ ] En tu perfil de GitHub, *Customize your pins*: fija `chasqui`.
- [ ] Publica en un canal por día y anota el resumen diario de ese día (ver *Métricas de un lanzamiento* en la [sección 10](#10-después)).
