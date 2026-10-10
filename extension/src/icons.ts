// Stroke icons from the Langtube design, built as DOM nodes (no innerHTML).
const ICONS = {
  speaker: ['M11 5L6 9H3v6h3l5 4V5z', 'M15.5 8.5a5 5 0 010 7M18.5 5.5a9 9 0 010 13'],
  replay: ['M3 12a9 9 0 109-9 9.7 9.7 0 00-6.7 2.8L3 8', 'M3 3v5h5'],
  bookmark: ['M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z'],
  check: ['M5 12l5 5L20 7'],
  mic: ['M12 2a3 3 0 013 3v6a3 3 0 01-6 0V5a3 3 0 013-3z', 'M5 11a7 7 0 0014 0M12 18v4'],
  stop: ['M7 7h10v10H7z'],
  play: ['M7 4v16l13-8z'],
} as const;

const FILLED: ReadonlySet<string> = new Set(['stop', 'play']);

export type IconName = keyof typeof ICONS;

export function icon(name: IconName, size = 20): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  const attrs: Record<string, string> = {
    width: String(size), height: String(size), viewBox: '0 0 24 24', 'aria-hidden': 'true',
    ...(FILLED.has(name)
      ? { fill: 'currentColor' }
      : { fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
  };
  for (const [k, v] of Object.entries(attrs)) svg.setAttribute(k, v);
  for (const d of ICONS[name]) {
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}
