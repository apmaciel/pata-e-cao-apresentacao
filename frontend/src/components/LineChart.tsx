interface Series {
  key: string;
  label: string;
  color: string;
  data: number[];
}

interface LineChartProps {
  xLabels: string[];
  series: Series[];
  height?: number;
  formatXLabel?: (label: string) => string;
}

const CHART_PAD = { top: 16, right: 16, bottom: 32, left: 48 };

export default function LineChart({
  xLabels,
  series,
  height = 220,
  formatXLabel,
}: LineChartProps) {
  const w = 600;
  const h = height;
  const pad = CHART_PAD;
  const pw = w - pad.left - pad.right;
  const ph = h - pad.top - pad.bottom;

  const allValues = series.flatMap((s) => s.data);
  const yMin = 0;
  const yMax = Math.max(...allValues, 1);

  const xScale = (i: number) => pad.left + (pw * i) / Math.max(xLabels.length - 1, 1);
  const yScale = (v: number) => pad.top + ph - (ph * (v - yMin)) / (yMax - yMin || 1);

  // Y-axis ticks
  const yTicks = 4;
  const yStep = (yMax - yMin) / yTicks || 1;

  // Choose X label interval to avoid crowding
  const xStep = Math.max(1, Math.floor(xLabels.length / 8));

  const buildPath = (values: number[]) =>
    values
      .map((v, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i).toFixed(1)} ${yScale(v).toFixed(1)}`)
      .join(' ');

  const fmt = (label: string) => (formatXLabel ? formatXLabel(label) : label);

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full h-auto"
        style={{ minWidth: 300 }}
        role="img"
      >
        {/* Grid lines */}
        {Array.from({ length: yTicks + 1 }, (_, i) => {
          const val = yMin + yStep * i;
          const y = yScale(val);
          return (
            <g key={`y-${i}`}>
              <line x1={pad.left} x2={w - pad.right} y1={y} y2={y} stroke="#e5e7eb" strokeWidth={1} />
              <text x={pad.left - 6} y={y + 4} textAnchor="end" className="text-[9px] fill-gray-400" fontFamily="Inter, sans-serif">
                {val}
              </text>
            </g>
          );
        })}

        {/* X labels */}
        {xLabels.map((label, i) => {
          if (i % xStep !== 0 && i !== xLabels.length - 1) return null;
          return (
            <text
              key={`x-${i}`}
              x={xScale(i)}
              y={h - 4}
              textAnchor="middle"
              className="text-[8px] fill-gray-400"
              fontFamily="Inter, sans-serif"
            >
              {fmt(label)}
            </text>
          );
        })}

        {/* Data lines */}
        {series.map((s) => (
          <g key={s.key}>
            <path
              d={buildPath(s.data)}
              fill="none"
              stroke={s.color}
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Dot on last point */}
            {s.data.length > 0 && (
              <circle
                cx={xScale(s.data.length - 1)}
                cy={yScale(s.data[s.data.length - 1])}
                r={2.5}
                fill={s.color}
              />
            )}
          </g>
        ))}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 justify-center">
        {series.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5 text-[10px] text-gray-500 font-medium">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
            {s.label}
          </div>
        ))}
      </div>
    </div>
  );
}
