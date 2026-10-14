# Protocolo de Chasqui — v1

Este documento es la **fuente de verdad** entre el cliente (TypeScript, `apps/web`) y el
servidor de señalización (Java, `apps/signal`). Como no comparten código, cualquier cambio
en un mensaje se hace primero aquí y después en ambos lados, en el mismo PR.

Palabras clave: DEBE, NO DEBE y PUEDE tienen el sentido de RFC 2119.

## 1. Secreto y URL

- La PC genera un secreto `s` de **16 bytes** con `crypto.getRandomValues`.
- El QR codifica: `https://app.<dominio>/#k=<base64url(s)>` (base64url sin relleno `=`, 22 caracteres).
- El fragmento (`#...`) nunca llega al servidor. El cliente DEBE borrarlo de la barra de
  direcciones (`history.replaceState`) después de leerlo en el dispositivo que escanea.

## 2. Derivación de claves

HKDF-SHA256 (WebCrypto), `salt` = 0 bytes, `ikm` = `s`:

| Valor    | `info` (UTF-8)    | Largo    | Uso                                                |
|----------|-------------------|----------|----------------------------------------------------|
| `roomId` | `chasqui/room/v1` | 16 bytes | Se envía al servidor como `base64url` (22 chars)   |
| `k_sig`  | `chasqui/sig/v1`  | 32 bytes | Clave AES-256-GCM para cifrar la señalización      |

`k_sig` se importa como `CryptoKey` no exportable.

## 3. Transporte de señalización

- WebSocket de texto. Producción: `wss://signal.<dominio>/ws`. Desarrollo: `ws://localhost:8443/ws`.
- Cada frame es **un objeto JSON** con campo `type`. Tamaño máximo de frame: **64 KiB**.
- El servidor DEBE rechazar el handshake si la cabecera `Origin` no está en la lista
  permitida (`ALLOWED_ORIGINS`, separada por comas).
- Versión del protocolo: `v = 1`.

### 3.1 Mensajes cliente → servidor

```jsonc
{ "type": "join",   "roomId": "<22 chars base64url>", "v": 1, "resume": "<22 chars base64url, opcional>" }
{ "type": "signal", "to": "<peerId>", "seq": 1, "data": "<base64url(iv || ciphertext)>" }
{ "type": "kick",   "peerId": "<peerId>" }      // solo lo acepta el primer dispositivo de la sala
{ "type": "report", "route": "host" | "srflx" | "relay" | "failed", "ms": 1234 }
{ "type": "ping" }
```

### 3.2 Mensajes servidor → cliente

```jsonc
{ "type": "joined", "peerId": "<id>", "peers": ["<id>", ...],
  "turn": { "urls": ["turn:...", "turns:..."], "username": "<exp>:<rand>", "credential": "<base64>", "ttl": 3600 } }
{ "type": "peer-joined", "peerId": "<id>" }
{ "type": "peer-left",   "peerId": "<id>" }
{ "type": "signal", "from": "<peerId>", "seq": 1, "data": "<base64url(iv || ciphertext)>" }
{ "type": "kicked" }                         // al expulsado, justo antes de cerrar su socket
{ "type": "error", "code": "<código>", "message": "<texto opcional para depurar>" }
{ "type": "pong" }
```

- `peerId`: 8 bytes aleatorios en base64url (11 chars), generado por el servidor al hacer `join`.
- `peers`: los demás dispositivos ya presentes (0 o 1 en v1).
- `turn`: PUEDE omitirse si el servidor no tiene `TURN_SECRET` configurado (desarrollo).
- `report` no tiene respuesta; el servidor solo suma contadores.
- `resume`: token aleatorio de 16 bytes que el cliente genera al abrir la sesión y repite en cada `join` de esa
  sesión (ver §3.5). Nunca sale del servidor ni se registra.

### 3.3 Códigos de error

| Código                | Cuándo                                                        | ¿Cierra el socket? |
|-----------------------|---------------------------------------------------------------|--------------------|
| `room-full`           | Ya hay 2 dispositivos en la sala                              | Sí                 |
| `unsupported-version` | `v` distinto de 1                                             | Sí                 |
| `bad-message`         | JSON inválido, `type` desconocido o campos inválidos          | No                 |
| `too-large`           | Frame mayor a 64 KiB                                          | Sí                 |
| `rate-limited`        | Se superó un límite (ver §6)                                  | Sí                 |
| `not-in-room`         | `signal`/`kick`/`report` antes de `join`, o `join` repetido   | No                 |
| `unknown-peer`        | `signal.to` o `kick.peerId` no está en la sala                | No                 |
| `forbidden`           | `kick` enviado por quien no es el primer dispositivo          | No                 |

### 3.4 Reglas del servidor

- Solo enruta. NUNCA interpreta ni registra `data`.
- Al reenviar `signal`, reemplaza `to` por `from` (el `peerId` real del remitente) y conserva `seq` y `data`.
- Cuando un socket se cierra, avisa `peer-left` al resto y lo saca de la sala. Sala vacía = sala borrada.
  - El cliente ignora `peer-left` si ya tiene el DataChannel abierto con ese dispositivo: solo cerró el WebSocket, no la conexión directa. La salida real se detecta cuando el canal se cierra o la reconexión (§3.5) se rinde.
- Si un `join` trae un `resume` igual al de un dispositivo que sigue en la sala, el nuevo socket lo **reemplaza**:
  conserva su `peerId` y su rol de primer dispositivo, el socket viejo se cierra con el código `4001` (`replaced`)
  y el otro dispositivo no recibe `peer-left` ni `peer-joined`. Así vuelve a la sala un celular cuyo socket anterior
  quedó colgado (cambio de red) sin chocar con `room-full`. La comparación del token es de tiempo constante.
- Códigos de cierre propios: `4000` sala expirada, `4001` socket reemplazado por el mismo dispositivo.

### 3.5 Reconexión (RF4)

Solo aplica cuando el DataChannel ya se abrió. Antes de eso, un corte se muestra como error y se reintenta a mano.

- **Señalización.** Si el WebSocket se cierra, el cliente vuelve a abrirlo y repite `join` con el mismo `roomId` y
  el mismo `resume`, con espera exponencial (1 s, 2 s, 4 s… hasta 15 s). Si no recibe respuesta a un `ping` en
  10 s, da el socket por muerto. Al volver la red (`online`) o la pestaña (`visibilitychange`), reintenta en el acto.
  Si al volver tiene otro `peerId` (el servidor ya había visto caer el socket), el otro lo recibe como `peer-joined`
  y actualiza a quién envía. `seq` sigue subiendo: nunca se reinicia dentro de la sesión.
- **Ruta directa.** Cuando `connectionState` pasa a `disconnected` por más de 2 s, o a `failed`, se reinicia ICE
  sobre la misma `RTCPeerConnection`: el DTLS y el DataChannel no se cierran, y lo que estaba en curso continúa.
  Solo reinicia quien ofreció al principio (`createOffer({ iceRestart: true })`); el otro le envía `restart` (§4).
  Se reintenta cada 8 s y, si a los 2 minutos no hay ruta, la sesión se da por perdida.
- Al volver a la sala, el cliente aplica las credenciales TURN nuevas de `joined` (`setConfiguration`), porque las
  anteriores pueden haber vencido.
- **Mismo dispositivo.** Quien tenga el QR podría unirse a la sala mientras el otro está fuera. Por eso cada lado fija
  la huella DTLS (`a=fingerprint`) del otro en la primera negociación y rechaza cualquier oferta o respuesta
  posterior con otra huella: un intruso puede estorbar la reconexión, pero no meterse en la sesión.

## 4. Señalización cifrada

`data` = `base64url( iv[12 bytes] || AES-GCM(k_sig, iv, plaintext, aad) )`, etiqueta de 128 bits.

- `iv`: 12 bytes aleatorios, nuevos en cada mensaje.
- `aad` (UTF-8): `chasqui/v1|<roomId>|<peerId del remitente>|<seq>`
- `seq`: entero que empieza en 1 y sube de 1 en 1 por remitente. El receptor DEBE descartar
  mensajes con `seq` menor o igual al último aceptado de ese remitente.
- Si el descifrado falla, el receptor DEBE descartar el mensaje y mostrar una advertencia
  ("la conexión pudo ser alterada"); NO DEBE seguir con esa negociación.

`plaintext` es JSON (UTF-8):

```jsonc
{ "kind": "hello",  "device": "Android · Chrome" }          // lo envía cada lado al ver al otro
{ "kind": "offer",  "sdp": "<SDP>" }
{ "kind": "answer", "sdp": "<SDP>" }
{ "kind": "ice",    "candidate": { /* RTCIceCandidateInit */ } | null }  // null = fin de candidatos
{ "kind": "restart" }                                        // pide a quien ofreció que reinicie ICE (§3.5)
```

**Quién ofrece:** el dispositivo que ya estaba en la sala (normalmente la PC) crea la oferta
cuando recibe `peer-joined`. El que llega responde.

## 5. Canal de datos

Un solo `RTCDataChannel` con etiqueta `chasqui`, `ordered: true`, confiable, `binaryType = "arraybuffer"`.

### 5.1 Control (frames de texto, JSON)

```jsonc
{ "t": "file-offer",  "id": 1, "name": "foto.jpg", "size": 123456, "mime": "image/jpeg" }
{ "t": "file-accept", "id": 1 }
{ "t": "file-cancel", "id": 1, "reason": "user" | "too-large" | "error" }
{ "t": "file-done",   "id": 1 }
{ "t": "file-ack",    "id": 1, "bytes": 65536 }
{ "t": "text",        "id": 2, "text": "hola" }
{ "t": "end" }
```

- `end` lo envía quien pulsa "Terminar", justo antes de cerrar. El receptor borra su chat: el dueño vuelve al QR y el invitado queda en la pantalla de sesión terminada.

- `id`: entero sin signo de 32 bits, único por remitente durante la sesión.
- En v1 el receptor acepta solo (`file-accept`) si `size <= 500 MB`; si no, responde
  `file-cancel` con `reason: "too-large"`. El emisor NO DEBE mandar trozos antes del `file-accept`.
- Cualquiera de los dos lados puede cancelar en cualquier momento con `file-cancel`.
- `file-ack`: el receptor confirma cuántos bytes del archivo tiene, con cada trozo pero no más
  seguido que cada 10 ms (lo que llegue en ese lapso se confirma al cumplirse), y una última vez
  con `bytes = size` al recibir `file-done`. El emisor lo usa para la barra de progreso y, por el
  relevo, para su ventana de envío. Una versión que no lo conoce lo ignora.

### 5.2 Datos (frames binarios)

```
| fileId: uint32 big-endian | chunkIndex: uint32 big-endian | payload (≤ 16 KiB) |
```

- Tamaño de trozo: **16 KiB** (16384 bytes) de payload.
- Control de flujo: pausar cuando `bufferedAmount > 8 MiB`; reanudar con
  `bufferedamountlow` (`bufferedAmountLowThreshold = 1 MiB`).
- Por el relevo (`relay`), el emisor además limita los bytes en vuelo (enviados y aún sin
  `file-ack`) con una ventana al estilo de TCP Vegas, y los reparte a lo largo del RTT
  (`transfer/pacer.ts`, ver [ADR 0006](adr/0006-relevo-sin-tope-y-costo.md)). Con la pestaña
  oculta no se reparte, solo se limita. Si en 2 s no llega ningún `file-ack`, el otro lado es
  una versión vieja y se envía sin ventana.
- El emisor manda `file-done` tras el último trozo y, si el receptor confirma, lo da por
  entregado con el último `file-ack` (o a los 30 s). El receptor verifica que recibió
  `ceil(size / 16384)` trozos y `size` bytes en total; si no, lo marca como error.

## 6. Límites (valores iniciales, configurables)

| Límite                                  | Valor   |
|-----------------------------------------|---------|
| Dispositivos por sala                   | 2       |
| Tamaño de frame                         | 64 KiB  |
| `join` por IP por minuto                | 10      |
| Mensajes por segundo por conexión       | 20      |
| Sala sin segundo dispositivo            | 10 min  |
| Sala inactiva (sin mensajes)            | 30 min  |
| Vida de credenciales TURN               | 1 h     |

La IP del cliente se toma de `CF-Connecting-IP` si existe (Cloudflare); si no, de la conexión.

## 7. Credenciales TURN (esquema "TURN REST API" de coturn)

- `username = "<unix_expiración>:<8 bytes aleatorios base64url>"`
- `credential = base64( HMAC-SHA1(TURN_SECRET, username) )`
- `urls` viene de la configuración del servidor (`TURN_URLS`, separadas por comas).

## 8. Vector de prueba

Ambos lados DEBEN reproducirlo en sus pruebas.

| Valor                | Resultado                                                          |
|----------------------|--------------------------------------------------------------------|
| `s` (hex)            | `000102030405060708090a0b0c0d0e0f`                                 |
| `s` (base64url)      | `AAECAwQFBgcICQoLDA0ODw`                                           |
| `roomId` (base64url) | `4BZEvLZec_lQv2QMaGIN6A`                                           |
| `k_sig` (hex)        | `7645b7cb1c5e8c4bb08ccb57eba36686376217fe6a947992a20f36da69f0a31c` |
