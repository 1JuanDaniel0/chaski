# Sistema de diseño

Estilo: neobank minimalista (referencia: iO de BCP). Lo limpio sale de lo que **no** se usa.
Todo vive en `apps/web/src/ui/styles.css`; los colores por defecto de Tailwind están desactivados,
así que solo existen los tokens de abajo.

## Reglas

- **1 color de marca:** achiote `#E4572E`. Solo para el logo, el punto "en vivo", el progreso y lo que llega (flecha ↓).
- **3 pasteles**, cada uno con un significado fijo:
  - durazno: la acción principal (QR, enviar archivos)
  - menta: estado seguro (conectado, cifrado)
  - cielo: ayuda (cómo funciona)
- **Neutros:** papel `#F6F3ED` (fondo), superficie blanca, tinta `#17150F` (texto y botones principales), gris `#77716A`, línea `#E8E2D8`.
- **Radios:** 12 / 20 / 28 px, y círculo completo para botones redondos. Nada más.
- **2 fuentes:** Instrument Serif para títulos grandes; Manrope (variable) para la interfaz. Autoalojadas, sin Google Fonts (la CSP solo permite `font-src 'self'`).
- **Iconos:** solo Phosphor, peso `bold` en acciones y `regular` en ilustrativos. Nunca dentro de un cuadrado.
- **Prohibido:** degradados, glassmorphism, sombras fuertes, emojis como iconos, texto con degradado, tarjetas todas iguales.
- **Jerarquía por tamaño, no por texto explicativo:** la acción principal es el tile más grande con el título serif más grande. Si hace falta una frase de ayuda, sobra un elemento.

## Movimiento

- Una sola curva: `cubic-bezier(0.22, 1, 0.36, 1)` (sale rápido y frena suave).
- Entradas: subir 12 px + aparecer, 420 ms, en cascada de 60 ms.
- Cambio de pantalla: 320 ms de entrada, 180 ms de salida.
- Listas: spring (`stiffness 520, damping 42`) con `layout` para que los elementos se reacomoden solos.
- Botones: escala 0.97 al presionar.
- `prefers-reduced-motion` desactiva todo.

## Marca

- **Logo:** una "c" abierta (el relevo) y un punto achiote que sale por la abertura (el mensaje en camino, que nadie retiene).
  Componente `LogoMark` en `src/ui/brand/Logo.tsx`; al cargar, el arco se dibuja y el punto aparece.
- **Ícono de app:** fondo tinta, "c" clara y punto achiote (`public/icon-*.png`, con versión maskable).

## Modo oscuro

Los mismos tokens se redefinen con `prefers-color-scheme: dark`. El QR sigue negro sobre blanco
en ambos modos porque es lo que las cámaras leen mejor.
