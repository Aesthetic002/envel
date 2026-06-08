"use client";

/** Semicircular CHI gauge drawn with SVG arcs — no chart dependency. */
export function ChiGauge({ chi, category }: { chi: number; category: string }) {
  const pct = Math.max(0, Math.min(100, chi)) / 100;

  // geometry: semicircle from 180° (left) to 0° (right)
  const cx = 100;
  const cy = 100;
  const r = 80;
  const startAngle = Math.PI; // 180°
  const endAngle = Math.PI - pct * Math.PI; // sweep
  const needle = polar(cx, cy, r - 6, endAngle);

  const color = chi >= 70 ? "var(--chart-1)" : chi >= 45 ? "var(--chart-2)" : "var(--chart-3)";

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 120" className="w-full max-w-[260px]">
        {/* track */}
        <path d={arc(cx, cy, r, startAngle, 0)} fill="none" stroke="var(--muted)" strokeWidth={14} strokeLinecap="round" />
        {/* value */}
        <path
          d={arc(cx, cy, r, startAngle, endAngle)}
          fill="none"
          stroke={color}
          strokeWidth={14}
          strokeLinecap="round"
        />
        {/* needle dot */}
        <circle cx={needle.x} cy={needle.y} r={6} fill={color} />
        {/* value text */}
        <text x={cx} y={cy - 8} textAnchor="middle" className="fill-foreground" fontSize={30} fontWeight={700}>
          {chi}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" className="fill-muted-foreground" fontSize={11}>
          / 100
        </text>
      </svg>
      <span
        className="mt-1 rounded-full px-3 py-1 text-sm font-medium"
        style={{ backgroundColor: tintBg(chi), color: tintFg(chi) }}
      >
        {category}
      </span>
    </div>
  );
}

function polar(cx: number, cy: number, r: number, angle: number) {
  return { x: cx + r * Math.cos(angle), y: cy - r * Math.sin(angle) };
}

function arc(cx: number, cy: number, r: number, a0: number, a1: number) {
  const p0 = polar(cx, cy, r, a0);
  const p1 = polar(cx, cy, r, a1);
  const largeArc = Math.abs(a0 - a1) > Math.PI ? 1 : 0;
  // sweep flag 1 because angles decrease (clockwise in screen coords)
  return `M ${p0.x} ${p0.y} A ${r} ${r} 0 ${largeArc} 1 ${p1.x} ${p1.y}`;
}

function tintBg(chi: number) {
  if (chi >= 70) return "oklch(0.92 0.06 150)";
  if (chi >= 45) return "oklch(0.93 0.07 80)";
  return "oklch(0.92 0.08 25)";
}
function tintFg(chi: number) {
  if (chi >= 70) return "oklch(0.35 0.1 150)";
  if (chi >= 45) return "oklch(0.4 0.1 70)";
  return "oklch(0.45 0.16 25)";
}
