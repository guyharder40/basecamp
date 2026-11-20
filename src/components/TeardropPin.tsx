import { teardropSvg } from '../types';
import type { PinType } from '../types';

// The teardrop map pin, rendered from the same SVG the map markers use, so
// the symbol a hunter picks here is exactly what appears on the map.
export default function TeardropPin({ type, color, size = 30, selected = false }: { type: PinType; color: string; size?: number; selected?: boolean }) {
  return (
    <span
      style={{ display: 'inline-block', width: size, height: Math.round(size * 1.125), flex: 'none', verticalAlign: 'middle', lineHeight: 0 }}
      dangerouslySetInnerHTML={{ __html: teardropSvg(type, color, selected) }}
    />
  );
}
