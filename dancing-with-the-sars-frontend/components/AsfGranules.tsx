"use client";

import React from "react";

export interface Granule {
  granule_name: string;
  flight_direction: string;
  polarization: string;
  start_time: string;
  bytes: number;
  download_url: string;
  thumbnail_url?: string | null;
}

interface AsfGranulesProps {
  granules: Granule[];
  isLoading: boolean;
}

export const AsfGranules: React.FC<AsfGranulesProps> = ({ granules, isLoading }) => {
  const formatBytes = (bytes: number) => {
    if (!bytes) return "0 MB";
    const mb = bytes / (1024 * 1024);
    return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
  };

  return (
    <section className="bg-[#111a24] p-5 rounded-lg border border-slate-700/80 text-white flex flex-col h-[400px]">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-base font-semibold text-slate-100">Source scenes</h2>
          <p className="text-xs text-slate-400">Direct SAR scenes from Alaska Satellite Facility</p>
        </div>
        <span className="text-xs bg-slate-800 border border-slate-700 text-slate-300 px-2.5 py-1 rounded-full">
          {granules.length} Granules Found
        </span>
      </div>
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">Querying ASF Archive...</div>
      ) : granules.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">No raw granules fetched yet. Run an analysis above.</div>
      ) : (
        <div className="flex-1 overflow-y-auto pr-1 space-y-2">
          {granules.map((granule, index) => (
            <div key={`${granule.granule_name}-${index}`} className="p-3 bg-slate-800/60 hover:bg-slate-800 rounded-xl border border-slate-700/60 transition flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-slate-200 truncate">{granule.granule_name}</p>
                <div className="flex gap-3 text-[11px] text-slate-400 mt-1">
                  <span>{granule.start_time.split("T")[0]}</span><span>•</span>
                  <span>{granule.flight_direction}</span><span>•</span><span>{formatBytes(granule.bytes)}</span>
                </div>
              </div>
              {granule.download_url && <a href={granule.download_url} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 border border-blue-500/30 rounded-lg text-xs font-semibold whitespace-nowrap">Download</a>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

export default AsfGranules;
