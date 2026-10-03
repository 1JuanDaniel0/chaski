import { useMemo } from 'react';
import { encode } from 'uqr';

/** QR como elemento SVG construido por React (sin HTML inyectado, compatible con CSP). */
export function QrCode({ text }: { text: string }) {
  const { size, d } = useMemo(() => {
    const { data, size } = encode(text, { ecc: 'M', border: 0 });
    let d = '';
    data.forEach((row, y) =>
      row.forEach((on, x) => {
        if (on) d += `M${x + 4} ${y + 4}h1v1h-1z`;
      }),
    );
    return { size: size + 8, d };
  }, [text]);
  return (
    <svg className="qr" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Código QR para emparejar" shapeRendering="crispEdges">
      <rect width={size} height={size} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}
