"use client";

import React from "react";
import type { TimeSeriesPoint } from "@/components/DanceChart";

interface TimeScrubberProps {
  observations: TimeSeriesPoint[];
  selectedIndex: number;
  onSelectedIndexChange: (index: number) => void;
  isLoading: boolean;
  comparisonStart: string;
  comparisonEnd: string;
  onComparisonStartChange: (date: string) => void;
  onComparisonEndChange: (date: string) => void;
  isComparisonLoading: boolean;
}

export const TimeScrubber: React.FC<TimeScrubberProps> = ({
  observations,
  selectedIndex,
  onSelectedIndexChange,
  isLoading,
  comparisonStart,
  comparisonEnd,
  onComparisonStartChange,
  onComparisonEndChange,
  isComparisonLoading,
}) => {
  const selected = observations[selectedIndex];
  const first = observations[0];
  const last = observations[observations.length - 1];
  const endpointChange = first && last ? last.backscatter - first.backscatter : null;

  return (
    <section className="rounded-lg border border-slate-700/80 bg-[#111a24] px-5 py-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">Timeline and interval comparison</h2>
          <p className="mt-1 text-xs text-slate-400">
            Select one acquisition at a time. This is not a first-to-last image overlay.
          </p>
        </div>
        <span className="shrink-0 text-right">
          <span className="block font-mono text-xs text-slate-200">
            {selected?.date ?? "Run analysis"}
          </span>
          <span className="mt-1 block text-[10px] text-slate-400">
            {isLoading
              ? "Loading scene…"
              : selected
                ? `${selected.backscatter.toFixed(2)} dB mean`
                : ""}
          </span>
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={Math.max(observations.length - 1, 0)}
        step={1}
        value={Math.min(selectedIndex, Math.max(observations.length - 1, 0))}
        disabled={observations.length < 2}
        onChange={(event) => onSelectedIndexChange(Number(event.target.value))}
        aria-label="Select radar observation date"
        className="w-full cursor-pointer accent-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
      />
      <div className="mt-1 flex justify-between text-[10px] text-slate-500">
        <span>{observations[0]?.date ?? "No observations"}</span>
        <span>{observations.length} acquisitions</span>
        <span>{observations[observations.length - 1]?.date ?? ""}</span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-[11px] text-slate-400">
          Changing either date updates the difference map; choose “Comparison” in Layers to view it.
        </p>
        <span className="shrink-0 text-[10px] text-slate-400" role="status">
          {isComparisonLoading ? "Updating comparison…" : comparisonStart && comparisonEnd ? "Comparison ready" : ""}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-700 pt-4">
        <label className="text-[11px] font-medium text-slate-400">
          Comparison start
          <select
            value={comparisonStart}
            disabled={observations.length < 2}
            onChange={(event) => onComparisonStartChange(event.target.value)}
            className="mt-1 block w-full rounded border border-slate-600 bg-slate-800 px-2 py-2 text-xs text-slate-100 disabled:opacity-50"
          >
            {observations
              .filter((point) => point.date < comparisonEnd)
              .map((point) => (
                <option key={point.date} value={point.date}>{point.date}</option>
              ))}
          </select>
        </label>
        <label className="text-[11px] font-medium text-slate-400">
          Comparison finish
          <select
            value={comparisonEnd}
            disabled={observations.length < 2}
            onChange={(event) => onComparisonEndChange(event.target.value)}
            className="mt-1 block w-full rounded border border-slate-600 bg-slate-800 px-2 py-2 text-xs text-slate-100 disabled:opacity-50"
          >
            {observations
              .filter((point) => point.date > comparisonStart)
              .map((point) => (
                <option key={point.date} value={point.date}>{point.date}</option>
              ))}
          </select>
        </label>
      </div>
      {endpointChange !== null && (
        <p className="mt-3 border-t border-slate-700 pt-2 text-[11px] text-slate-400">
          First-to-last regional mean shift:{" "}
          <span className="font-medium text-slate-200">
            {endpointChange > 0 ? "+" : ""}
            {endpointChange.toFixed(2)} dB
          </span>
          {" "}— backscatter difference, not a confirmed land-cover change.
        </p>
      )}
    </section>
  );
};
