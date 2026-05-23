import * as React from "react";

export interface SparklinePoint {
  date: string;   // YYYY-MM-DD
  value: number;
}

export interface SparklineMarker {
  date: string;   // YYYY-MM-DD
  label?: string;
}

export interface SparklineProps {
  points: SparklinePoint[];
  width?: number;
  height?: number;
  /** Y-axis label semantics: "position" inverts the y-axis (lower number = higher on chart). */
  yMode?: "position" | "value";
  stroke?: string;
  fill?: string;
  markers?: SparklineMarker[];
  /** Render a baseline at the average of all values. */
  showAverage?: boolean;
}

/**
 * Lightweight inline-SVG sparkline. No external chart lib.
 * - In "position" mode the Y-axis is inverted (better rank = higher on the chart).
 * - Markers render as vertical dashed lines.
 */
export function Sparkline({
  points,
  width = 560,
  height = 100,
  yMode = "value",
  stroke = "#4f46e5",
  fill = "rgba(79, 70, 229, 0.08)",
  markers = [],
  showAverage = false,
}: SparklineProps) {
  if (points.length === 0) {
    return (
      <div
        style={{
          width,
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--muted, #9ca3af)",
          fontSize: 12,
          background: "var(--surface-2, #fafafa)",
          borderRadius: 6,
        }}
      >
        Geen data
      </div>
    );
  }

  const padX = 4;
  const padY = 6;
  const w = width - padX * 2;
  const h = height - padY * 2;

  // Build x positions evenly spaced by index. (Dates that the API skipped get
  // collapsed; for a sparkline that's fine.)
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const dateIndex = new Map<string, number>();
  sorted.forEach((p, i) => dateIndex.set(p.date, i));

  const values = sorted.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const xFor = (i: number) =>
    padX + (sorted.length === 1 ? w / 2 : (i / (sorted.length - 1)) * w);
  const yFor = (v: number) => {
    const norm = (v - min) / range;
    // value mode: higher value = higher on chart (svg y inverted); position mode: lower value = higher
    const fraction = yMode === "position" ? norm : 1 - norm;
    return padY + fraction * h;
  };

  const linePath = sorted
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(i)} ${yFor(p.value)}`)
    .join(" ");

  const areaPath = `${linePath} L ${xFor(sorted.length - 1)} ${padY + h} L ${xFor(0)} ${padY + h} Z`;

  const avg = values.reduce((s, v) => s + v, 0) / values.length;

  return (
    <svg width={width} height={height} role="img" aria-label="Sparkline">
      <path d={areaPath} fill={fill} stroke="none" />
      <path d={linePath} fill="none" stroke={stroke} strokeWidth={1.5} />

      {showAverage && (
        <line
          x1={padX}
          x2={width - padX}
          y1={yFor(avg)}
          y2={yFor(avg)}
          stroke="var(--border, #d1d5db)"
          strokeDasharray="3 3"
          strokeWidth={1}
        />
      )}

      {markers.map((m, i) => {
        const idx = dateIndex.get(m.date);
        if (idx == null) return null;
        const x = xFor(idx);
        return (
          <g key={`${m.date}-${i}`}>
            <line
              x1={x}
              x2={x}
              y1={padY}
              y2={padY + h}
              stroke="#f59e0b"
              strokeDasharray="2 3"
              strokeWidth={1}
            />
            <circle cx={x} cy={padY + 4} r={3} fill="#f59e0b" />
            {m.label && (
              <title>{`${m.date} — ${m.label}`}</title>
            )}
          </g>
        );
      })}

      {/* Endpoint dot showing the latest value */}
      <circle
        cx={xFor(sorted.length - 1)}
        cy={yFor(values[values.length - 1]!)}
        r={3}
        fill={stroke}
      />
    </svg>
  );
}
