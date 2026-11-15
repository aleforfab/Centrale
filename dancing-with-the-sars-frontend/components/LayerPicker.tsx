"use client";

import React from "react";
import { pairDates } from "@/lib/comparison";
import type { ProductLayer, SiteManifest } from "@/lib/types";

interface LayerPickerProps {
  id: string;
  manifest: SiteManifest;
  pol: string;
  value: string[];
  onChange: (layerIds: string[]) => void;
}

/** Human label for a mounted product layer, e.g. "Change mask · 2026-08-13 → 2026-08-25 · 6 dB". */
export function layerLabel(manifest: SiteManifest, layer: ProductLayer): string {
  const pair = layer.pair_id ? manifest.pairs.find((item) => item.id === layer.pair_id) : undefined;
  const span = pair ? Object.values(pairDates(pair)).filter(Boolean).join(" → ") : "";
  if (layer.kind === "difference") return [`Difference`, span].filter(Boolean).join(" · ");
  if (layer.kind === "change_mask") return [`Change mask`, span, layer.threshold_db ? `${layer.threshold_db} dB` : ""].filter(Boolean).join(" · ");
  return [layer.title ?? layer.kind, layer.date ?? "", layer.pol ?? ""].filter(Boolean).join(" · ");
}

/**
 * Product layers that can be drawn on top of an observation: measured
 * differences and change masks of the requested polarization.
 */
export function overlayCandidates(manifest: SiteManifest, pol: string): ProductLayer[] {
  return manifest.layers.filter(
    (layer) => (layer.kind === "difference" || layer.kind === "change_mask") && (!layer.pol || layer.pol === pol),
  );
}

/**
 * Layer control shared by the time machine and the before/after workspace.
 * Every entry is a real installed product; nothing is synthesized.
 */
export function LayerPicker({ id, manifest, pol, value, onChange }: LayerPickerProps) {
  const candidates = overlayCandidates(manifest, pol);
  const toggle = (layerId: string) => {
    onChange(value.includes(layerId) ? value.filter((item) => item !== layerId) : [...value, layerId]);
  };
  return (
    <details className="tm-panel" id={id}>
      <summary className="cursor-pointer text-sm">
        Layers {value.length ? `· ${value.length} added` : "· add measured change"}
      </summary>
      {candidates.length ? (
        <fieldset className="mt-3">
          <legend className="text-xs">Installed change products</legend>
          <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {candidates.map((layer) => (
              <li key={layer.id}>
                <label className="flex items-start gap-2 text-xs">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={value.includes(layer.id)}
                    onChange={() => toggle(layer.id)}
                    aria-label={`Show ${layerLabel(manifest, layer)}`}
                  />
                  <span>{layerLabel(manifest, layer)}</span>
                </label>
              </li>
            ))}
          </ul>
          <p className="footnote mt-2">Added layers are drawn over both dates at reduced opacity.</p>
        </fieldset>
      ) : (
        <p className="footnote mt-3">No measured change product is installed for {pol} on this site.</p>
      )}
    </details>
  );
}
