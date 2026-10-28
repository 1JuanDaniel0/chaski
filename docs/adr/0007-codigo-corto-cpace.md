# ADR 0007: Código corto de 6 dígitos con CPace (RF6)

## Contexto
Emparejar exige escanear el QR. Eso falla cuando no hay cámara a mano: pasar de una PC a otra, una laptop sin cámara o un celular con la cámara rota. Hasta ahora, para ir de PC a PC había que usar el celular de intermediario.

Un código corto se puede dictar y escribir, pero es débil: 6 dígitos son 1 millón de combinaciones. Si la sala o la clave salieran del código, el servidor (o quien lo comprometa) los probaría todos en un segundo y podría meterse en la conexión. Hoy el servidor no puede hacer eso con el QR, y el código no debe empeorarlo más de lo necesario.

## Decisión
- **Un PAKE, CPace** ([draft-irtf-cfrg-cpace](https://datatracker.ietf.org/doc/draft-irtf-cfrg-cpace/), el recomendado por el CFRG), suite `CPACE-RISTRETTO255-SHA512` con confirmación explícita. Con un PAKE, quien no sabe el código solo puede probar uno por intento y en vivo; los mensajes no le sirven para probar códigos sin conexión.
- **El código tiene dos partes:** 2 dígitos de casillero, que asigna el servidor para encontrar a la PC, y 4 de PIN, que genera la PC y nunca se envía. El servidor necesita el casillero para juntar a los dos, así que el PIN es lo único secreto.
- **El código solo entrega el secreto del QR.** Tras CPace, la PC envía el mismo `s` de su QR cifrado con la clave acordada, y el otro dispositivo hace `join` como si hubiera escaneado. Así la sala, el cifrado de la señalización, la reconexión (RF4) y la expulsión no cambian.
- **Un código, un intento.** Si la confirmación falla, la PC lo descarta, avisa y muestra otro. Vence a los 2 minutos.
- **Librería:** `@noble/curves` para ristretto255 (WebCrypto no la trae). Está auditada y no tiene dependencias en tiempo de ejecución salvo `@noble/hashes`, del mismo autor. Los hashes, HMAC, HKDF y AES-GCM siguen con WebCrypto. Se carga con `import()` solo al mostrar o escribir un código (~15 KB gzip), para no engordar el JS inicial.
- **Servidor:** solo reparte casilleros y reenvía 2 mensajes por lado, sin interpretarlos (protocolo §9).

## Alternativas descartadas
- **Derivar la sala del código** (sin PAKE): el servidor lo adivina sin conexión en un segundo.
- **8 dígitos (3 + 5):** 10 veces más difícil de adivinar, pero más molesto de dictar y escribir. Con un intento por código y un aviso en la PC, 1 en 10.000 basta para este caso de uso. Si Chaski crece y los 100 casilleros se quedan cortos, se pasa a 8 sin cambiar el diseño.
- **SPAKE2:** necesita constantes fijas M y N y es más fácil de implementar mal. CPace es el que recomienda el CFRG y tiene vectores de prueba para ristretto255.
- **Implementar ristretto255 a mano:** riesgo innecesario frente a una librería auditada.

## Consecuencias
- El código es más débil que el QR (13 bits secretos frente a 128): la PC lo muestra como alternativa, debajo del QR.
- Quien vea la pantalla puede usar el código, igual que puede fotografiar el QR. La PC muestra quién se conectó y puede expulsarlo.
- Alguien que pruebe casilleros al azar puede quemar códigos ajenos. Lo limita el tope de 10 intentos por IP y minuto, y la PC simplemente muestra otro.
- Primera dependencia criptográfica de la web; Dependabot la vigila como al resto.
- Las pruebas reproducen los vectores oficiales del borrador (revisión 21) para el generador, `Ya`, `Yb` e `ISK`.
