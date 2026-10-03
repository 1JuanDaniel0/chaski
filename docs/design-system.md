# Sistema de diseño

Estilo: neobank minimalista (referencia: iO de BCP). Lo limpio sale de lo que **no** se usa.
Todo vive en `apps/web/src/ui/styles.css`; los colores por defecto de Tailwind están desactivados,
así que solo existen los tokens de abajo.

## Reglas

- **1 color de marca:** naranja `#FF5A36` (el folder del chaski). Logo, formas de la card protagonista, progreso y lo que llega (flecha ↓).
- **Pasteles con significado fijo:** aqua (conectado, cifrado), lavanda (ayuda), durazno (resumen de la sesión) y gris niebla (cards de contenido y lista).
- **Card protagonista:** fondo casi negro con dos formas orgánicas planas (naranja y durazno) que derivan lento. Una por pantalla: el QR o "Enviar archivos". El texto va abajo a la izquierda, siempre sobre el fondo oscuro.
- **Neutros:** fondo blanco con un gran arco gris suave en la esquina (como iO), tinta `#111114` para texto y botones píldora.
- **Radios:** 12 / 20 / 28 px, y círculo completo para botones. Nada más.
- **1 fuente:** Outfit (variable), sans geométrica y amigable. Títulos en 600 con tracking negativo. Autoalojada, sin Google Fonts (la CSP solo permite `font-src 'self'`).
- **Cards al estilo iO:** título en negrita arriba a la izquierda, ícono de línea arriba a la derecha, dato grande abajo.
- **Iconos:** solo Phosphor de línea. Nunca dentro de un cuadrado.
- **Prohibido:** degradados, glassmorphism, sombras fuertes, emojis como iconos, texto con degradado, tarjetas todas iguales.
- **Jerarquía por tamaño, no por texto explicativo:** la acción principal es la card más grande con el título más grande. Si hace falta una frase de ayuda, sobra un elemento.

## Movimiento

- Una sola curva: `cubic-bezier(0.22, 1, 0.36, 1)` (sale rápido y frena suave).
- Entradas: subir 12 px + aparecer, 420 ms, en cascada de 60 ms.
- Formas de la card protagonista: deriva lenta de 14–18 s.
- Cambio de pantalla: 320 ms de entrada, 180 ms de salida.
- Listas: spring (`stiffness 520, damping 42`) con `layout` para que los elementos se reacomoden solos.
- Botones: escala 0.97 al presionar.
- `prefers-reduced-motion` desactiva todo.

## Marca

- **Nombre:** Chaski, la escritura quechua original de "chasqui", el mensajero inca de relevos.
- **Logo:** un chaski moderno corriendo con un folder. Su cuerpo forma la "k" del nombre y las cintas
  de su tocado (llauto) ondean hacia atrás por la velocidad. Componente `LogoMark` en `src/ui/brand/Logo.tsx`;
  con `running` rebota y las cintas ondean (se usa en "Conectando" y en el tutorial, donde lleva el archivo).
- **Ícono de app:** fondo casi negro, chaski blanco, folder y cintas naranjas (`public/icon-*.png`, con versión maskable).

## Modo oscuro

Los mismos tokens se redefinen con `prefers-color-scheme: dark`. El QR sigue negro sobre blanco
en ambos modos porque es lo que las cámaras leen mejor.
