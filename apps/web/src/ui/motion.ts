import type { Transition, Variants } from 'motion/react';

/** Curva única de la app: sale rápido y frena suave. */
export const EASE = [0.22, 1, 0.36, 1] as const;

export const fast: Transition = { duration: 0.24, ease: EASE };

/** Entrada de tiles en cascada: suben 12 px y aparecen. */
export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};

export const rise: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.42, ease: EASE } },
};

/** Cambio de pantalla: cruce corto, sin desplazamientos largos. */
export const screen: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.32, ease: EASE } },
  exit: { opacity: 0, y: -6, transition: { duration: 0.18, ease: EASE } },
};
