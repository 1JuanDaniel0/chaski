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
{ "type": "join",   "roomId": "<22 chars base64url>", "v": 1 }
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
  - El cliente ignora `peer-left` si ya tiene el DataChannel abierto con ese dispositivo: solo cerró el WebSocket, no la conexión directa. La salida real se detecta cuando el canal se cierra o ICE pasa a `failed`.

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
{ "t": "text",        "id": 2, "text": "hola" }
{ "t": "end" }
```

- `end` lo envía quien pulsa "Terminar", justo antes de cerrar. El receptor borra su chat: el dueño vuelve al QR y el invitado queda en la pantalla de sesión terminada.

- `id`: entero sin signo de 32 bits, único por remitente durante la sesión.
- En v1 el receptor acepta solo (`file-accept`) si `size <= 500 MB`; si no, responde
  `file-cancel` con `reason: "too-large"`. El emisor NO DEBE mandar trozos antes del `file-accept`.
- Cualquiera de los dos lados puede cancelar en cualquier momento con `file-cancel`.

### 5.2 Datos (frames binarios)

```
| fileId: uint32 big-endian | chunkIndex: uint32 big-endian | payload (≤ 16 KiB) |
```

- Tamaño de trozo: **16 KiB** (16384 bytes) de payload.
- Control de flujo: pausar cuando `bufferedAmount > 8 MiB`; reanudar con
  `bufferedamountlow` (`bufferedAmountLowThreshold = 1 MiB`).
- El emisor manda `file-done` tras el último trozo. El receptor verifica que recibió
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
