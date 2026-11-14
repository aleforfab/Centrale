"use client";

import React from "react";

interface ControlPanelProps {
  studyId: StudyId;
  onStudyChange: (studyId: StudyId) => void;
  preStart: string;
  setPreStart: (s: string) => void;
  preEnd: string;
  setPreEnd: (s: string) => void;
  postStart: string;
  setPostStart: (s: string) => void;
  postEnd: string;
  setPostEnd: (s: string) => void;
  polarization: string;
  setPolarization: (p: string) => void;
  threshold: number;
  setThreshold: (t: number) => void;
  activeLayer: "observation" | "both" | "rgb" | "mask" | "comparison";
  setActiveLayer: (l: "observation" | "both" | "rgb" | "mask" | "comparison") => void;
  onRunAnalysis: () => void;
  isLoading: boolean;
  isUpdatingMask: boolean;
}

export type StudyId = "thwaites" | "kahramanmaras" | "mato-grosso";

const studies: { id: StudyId; title: string; change: string; coordinates: string }[] = [
  { id: "thwaites", title: "Thwaites Glacier", change: "Ice-sheet surface change", coordinates: "West Antarctica" },
  { id: "kahramanmaras", title: "Kahramanmaraş earthquake", change: "Post-earthquake surface change", coordinates: "Türkiye" },
  { id: "mato-grosso", title: "Amazon frontier", change: "Forest and agricultural change", coordinates: "Mato Grosso, Brazil" },
];

export const ControlPanel: React.FC<ControlPanelProps> = ({
  studyId,
  onStudyChange,
  preStart,
  setPreStart,
  preEnd,
  setPreEnd,
  postStart,
  setPostStart,
  postEnd,
  setPostEnd,
  polarization,
  setPolarization,
  threshold,
  setThreshold,
  activeLayer,
  setActiveLayer,
  onRunAnalysis,
  isLoading,
  isUpdatingMask,
}) => {
  return (
    <section className="bg-[#111a24] p-5 rounded-lg border border-slate-700/80 text-white flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight text-slate-100">Analysis controls</h2>
        <span className="text-[11px] text-slate-300 px-2 py-1 rounded border border-slate-600">
          Sentinel-1
        </span>
      </div>

      <div>
        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
          Case studies
        </label>
        <div className="flex flex-col gap-2">
          {studies.map((study) => (
            <button
              key={study.id}
              type="button"
              aria-pressed={studyId === study.id}
              onClick={() => onStudyChange(study.id)}
              className={`px-3 py-2.5 rounded-md border text-left transition ${
                studyId === study.id
                  ? "border-blue-500/70 bg-blue-950/50"
                  : "border-slate-700 bg-slate-800 hover:bg-slate-700"
              }`}
            >
              <span className="block text-xs font-semibold text-slate-100">{study.title}</span>
              <span className="block text-[11px] text-slate-400 mt-1">
                {study.change} · {study.coordinates}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-[11px] leading-relaxed text-slate-400">
          These date windows define the radar periods compared in the event composite and threshold layer.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <fieldset className="col-span-2 grid grid-cols-2 gap-3 rounded-md border border-slate-700 p-3">
            <legend className="px-1 text-[11px] font-semibold text-slate-300">Before event period</legend>
            <label className="text-xs text-slate-400">
              Start
              <input
                type="date"
                value={preStart}
                onChange={(e) => setPreStart(e.target.value)}
                className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-md p-1.5 text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </label>
            <label className="text-xs text-slate-400">
              End
              <input
                type="date"
                value={preEnd}
                onChange={(e) => setPreEnd(e.target.value)}
                className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-md p-1.5 text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </label>
          </fieldset>
          <fieldset className="col-span-2 grid grid-cols-2 gap-3 rounded-md border border-slate-700 p-3">
            <legend className="px-1 text-[11px] font-semibold text-slate-300">After event period</legend>
            <label className="text-xs text-slate-400">
              Start
              <input
                type="date"
                value={postStart}
                onChange={(e) => setPostStart(e.target.value)}
                className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-md p-1.5 text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </label>
            <label className="text-xs text-slate-400">
              End
              <input
                type="date"
                value={postEnd}
                onChange={(e) => setPostEnd(e.target.value)}
                className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-md p-1.5 text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </label>
          </fieldset>
        </div>
      </div>

      <div className="flex gap-4 items-center">
        <div className="flex-1">
          <label className="text-xs text-slate-400 block mb-1 font-medium">Polarization</label>
          <div className="grid grid-cols-4 rounded-lg bg-slate-800 p-0.5 border border-slate-700">
            {["VV", "VH", "HH", "HV"].map((pol) => (
              <button
                key={pol}
                onClick={() => setPolarization(pol)}
                className={`flex-1 py-1 text-xs rounded-md font-semibold transition ${
                  polarization === pol ? "bg-blue-600 text-white shadow" : "text-slate-400 hover:text-white"
                }`}
              >
                {pol}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1">
          <label className="text-xs text-slate-400 block mb-1 font-medium">
            Backscatter drop threshold: <span className="text-blue-400 font-bold">{threshold} dB</span>
          </label>
          <input
            type="range"
            min="-8"
            max="-1"
            step="0.5"
            value={threshold}
            onChange={(e) => setThreshold(parseFloat(e.target.value))}
            className="w-full accent-blue-500 cursor-pointer"
          />
          <p className="mt-1 min-h-4 text-[10px] text-slate-500" role="status">
            {isUpdatingMask ? "Updating threshold map…" : "Map updates as you adjust the threshold."}
          </p>
        </div>
      </div>

      <div>
        <label className="text-xs text-slate-400 block mb-1 font-medium">Layers</label>
        <div className="grid grid-cols-2 gap-1 bg-slate-800 p-1 rounded-lg border border-slate-700 text-xs">
          {(["observation", "comparison", "both", "rgb", "mask"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={activeLayer === mode}
              onClick={() => setActiveLayer(mode)}
              className={`py-1 rounded font-medium capitalize transition ${
                activeLayer === mode ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              {mode === "observation" ? "Daily SAR" : mode === "comparison" ? "Comparison" : mode === "both" ? "Combined" : mode === "rgb" ? "Composite" : "Backscatter Threshold"}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={onRunAnalysis}
        disabled={isLoading}
        className="w-full mt-2 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded-md transition duration-200 flex items-center justify-center gap-2"
      >
        {isLoading ? (
          <>
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Analyzing SAR Data...
          </>
        ) : (
          "Run SAR Dance Analysis"
        )}
      </button>
    </section>
  );
};
