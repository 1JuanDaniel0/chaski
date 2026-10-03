import { useMemo } from 'react';
import { encode } from 'uqr';

/** QR como elemento SVG construido por React (sin HTML inyectado, compatible con CSP). */
export function QrCode({ text, className = '' }: { text: string; className?: string }) {
  const { size, d } = useMemo(() => {
    const { data, size } = encode(text, { ecc: 'M', border: 0 });
    let d = '';
    data.forEach((row, y) =>
      row.forEach((on, x) => {
        if (on) d += `M${x} ${y}h1v1h-1z`;
      }),
    );
    return { size, d };
  }, [text]);
  // Negro sobre blanco siempre, también en modo oscuro: es lo que leen mejor las cámaras.
  return (
    <svg className={`qr ${className}`} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Código QR para emparejar" shapeRendering="crispEdges">
      <path d={d} fill="#000" />
    </svg>
  );
}
