"use client";

import React from "react";

export interface TimeSeriesPoint {
  date: string;
  backscatter: number;
  cycle?: number;
  maturity?: string;
}

interface DanceChartProps {
  data: TimeSeriesPoint[];
  polarization: string;
  selectedDate?: string;
}

export const DanceChart: React.FC<DanceChartProps> = ({ data, polarization, selectedDate }) => {
  const width = 640;
  const height = 240;
  const padding = { top: 20, right: 20, bottom: 38, left: 46 };
  const validPoints = data
    .map((point) => ({ ...point, timestamp: Date.parse(point.date) }))
    .filter((point) => Number.isFinite(point.backscatter) && Number.isFinite(point.timestamp));
  const values = validPoints.map((point) => point.backscatter);
  const min = values.length ? Math.min(...values) : -25;
  const max = values.length ? Math.max(...values) : -5;
  const range = max - min || 1;
  const firstTime = validPoints.length ? validPoints[0].timestamp : 0;
  const lastTime = validPoints.length ? validPoints[validPoints.length - 1].timestamp : firstTime + 1;
  const x = (timestamp: number) =>
    padding.left +
    ((timestamp - firstTime) / Math.max(lastTime - firstTime, 1)) * (width - padding.left - padding.right);
  const y = (value: number) =>
    padding.top +
    ((max - value) / range) * (height - padding.top - padding.bottom);
  const gapStart = Date.parse("2026-07-27");
  const gapEnd = Date.parse("2026-08-10");
  const visibleGapStart = Math.max(firstTime, gapStart);
  const visibleGapEnd = Math.min(lastTime, gapEnd);
  const gapVisible = validPoints.length > 1 && visibleGapStart < visibleGapEnd;
  const path = validPoints.map((point, index) => {
    const previous = validPoints[index - 1];
    const startsSegment = !previous
      || previous.maturity !== point.maturity
      || (previous.timestamp < gapEnd && point.timestamp > gapStart);
    return `${startsSegment ? "M" : "L"} ${x(point.timestamp)} ${y(point.backscatter)}`;
  }).join(" ");
  const cycleGaps: string[] = [];
  const cycles = [...new Set(validPoints.map((point) => point.cycle).filter((cycle): cycle is number => cycle !== undefined))].sort((a, b) => a - b);
  for (let index = 1; index < cycles.length; index += 1) {
    if (cycles[index] - cycles[index - 1] > 1) {
      cycleGaps.push(`${cycles[index - 1] + 1}–${cycles[index] - 1}`);
    }
  }

  return (
    <section className="bg-[#111a24] p-5 rounded-lg border border-slate-700/80 text-white">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-base font-semibold text-slate-100">Backscatter over time</h2>
          <p className="text-xs text-slate-400">Mean {polarization} backscatter by acquisition</p>
        </div>
        <span className="text-right text-xs text-slate-500">
          {data.length} observations
          {cycleGaps.length > 0 && <span className="block text-amber-300">Cycle gaps: {cycleGaps.join(", ")}</span>}
        </span>
      </div>
      {data.length === 0 ? (
        <div className="h-60 flex items-center justify-center text-sm text-slate-500">
          No time-series observations are available for this site.
        </div>
      ) : (
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-60" role="img" aria-label="Backscatter time series">
          <line x1={padding.left} x2={padding.left} y1={padding.top} y2={height - padding.bottom} stroke="#334155" />
          <line x1={padding.left} x2={width - padding.right} y1={height - padding.bottom} y2={height - padding.bottom} stroke="#334155" />
          {gapVisible && (
            <>
              <rect
                x={x(visibleGapStart)}
                y={padding.top}
                width={Math.max(1, x(visibleGapEnd) - x(visibleGapStart))}
                height={height - padding.top - padding.bottom}
                fill="#f59e0b"
                fillOpacity="0.12"
              />
              <text x={x(visibleGapStart) + 3} y={padding.top + 12} fill="#fbbf24" fontSize="9">
                NISAR data gap
              </text>
            </>
          )}
          <text x="8" y={padding.top + 5} fill="#94a3b8" fontSize="11">{max.toFixed(1)} dB</text>
          <text x="8" y={height - padding.bottom} fill="#94a3b8" fontSize="11">{min.toFixed(1)} dB</text>
          <path d={path} fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          {validPoints.map((point) => (
            <circle
              key={`${point.date}-${point.cycle ?? "cycle"}`}
              cx={x(point.timestamp)}
              cy={y(point.backscatter)}
              r={point.date === selectedDate ? "5" : "3"}
              fill={point.date === selectedDate ? "#f8fafc" : "#38bdf8"}
              stroke={point.date === selectedDate ? "#0284c7" : "none"}
              strokeWidth="2"
            >
              <title>{`${point.date}: ${point.backscatter.toFixed(2)} dB${point.maturity ? ` · ${point.maturity}` : ""}`}</title>
            </circle>
          ))}
          <text x={padding.left} y={height - 12} fill="#94a3b8" fontSize="11">{validPoints[0]?.date}</text>
          <text x={width - padding.right} y={height - 12} textAnchor="end" fill="#94a3b8" fontSize="11">{validPoints[validPoints.length - 1]?.date}</text>
        </svg>
      )}
    </section>
  );
};

export default DanceChart;
