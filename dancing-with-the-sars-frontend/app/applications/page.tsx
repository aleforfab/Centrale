import React from "react";
import { SiteNav } from "@/components/SiteNav";
import {
  APPLICATIONS,
  CAPABILITIES,
  capabilityFor,
  registerEntryFor,
  topicsRequiringInterferometry,
} from "@/lib/applications";

export const metadata = {
  title: "Applications library · Dancing with the SARs",
  description: "What NISAR radar observations can and cannot show for twelve application topics",
};

function BulletList({ heading, items, tone }: { heading: string; items: string[]; tone: "sky" | "amber" | "slate" }) {
  const colour = tone === "sky" ? "text-sky-300" : tone === "amber" ? "text-amber-300" : "text-slate-300";
  return (
    <div>
      <h4 className={`text-[11px] font-semibold uppercase tracking-wide ${colour}`}>{heading}</h4>
      <ul className="mt-2 space-y-1.5 text-xs leading-5 text-slate-300">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-slate-500" aria-hidden="true" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ApplicationsPage() {
  const interferometryCount = topicsRequiringInterferometry().length;

  return (
    <main className="min-h-screen bg-[#0b1118] p-4 text-slate-100 sm:p-6 lg:p-8">
      <header className="mb-3 border-b border-slate-700/70 pb-4">
        <p className="mb-2 text-[11px] uppercase tracking-[0.2em] text-slate-500">Earth observation workspace</p>
        <h1 className="text-2xl font-semibold tracking-tight">Applications library</h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">
          Twelve NISAR application topics. Each entry separates what a radar time series can genuinely show from
          what needs a different measurement or an independent source.
        </p>
      </header>

      <SiteNav current="/applications" />

      <section className="mb-6 rounded-lg border border-slate-700/80 bg-[#111a24] p-5">
        <h2 className="text-sm font-semibold">Capability labels used here</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          {Object.values(CAPABILITIES).map((capability) => (
            <div key={capability.id} className="rounded border border-slate-700 bg-slate-950/50 p-3">
              <p className="text-xs font-semibold text-slate-100">{capability.label}</p>
              <p className="mt-1 text-[11px] leading-5 text-slate-400">{capability.meaning}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[11px] leading-5 text-amber-200/80">
          Every topic below is a <strong>Learning resource</strong>. This repository holds no validated real case
          for any of them, so no topic is labelled exploratory or validated. Using the software successfully is
          not the same as validating an interpretation.
        </p>
        <p className="mt-2 text-[11px] leading-5 text-slate-500">
          {interferometryCount} of {APPLICATIONS.length} topics need interferometric phase or offset tracking for
          their central measurement. This pipeline produces GCOV backscatter and differences, so those topics are
          explicitly out of reach here.
        </p>
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {APPLICATIONS.map((topic, index) => {
          const capability = CAPABILITIES[capabilityFor(topic.id)];
          const registerEntry = registerEntryFor(topic);
          return (
            <article key={topic.id} className="rounded-lg border border-slate-700/80 bg-[#111a24] p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                    Topic {String(index + 1).padStart(2, "0")}
                  </p>
                  <h2 className="mt-1 text-lg font-semibold">{topic.title}</h2>
                </div>
                <span className="shrink-0 rounded border border-sky-500/40 bg-sky-500/10 px-2 py-1 text-[10px] font-medium text-sky-200">
                  {capability.label}
                </span>
              </div>

              <p className="mt-3 text-sm leading-6 text-slate-300">{topic.summary}</p>

              <div className="mt-4 space-y-4">
                <BulletList heading="Possible exploration" items={topic.exploration} tone="sky" />
                <BulletList heading="Interpretation limits" items={topic.limitations} tone="amber" />
                <BulletList heading="Methods a real study would still need" items={topic.methodsNeeded} tone="slate" />
              </div>

              <div className="mt-4 border-t border-slate-700/70 pt-3 text-[10px] leading-4 text-slate-500">
                <p>
                  Source document:{" "}
                  <span className="font-mono text-slate-400">{topic.sourceFilename}</span>
                  {registerEntry?.sha256 ? (
                    <span className="ml-1">· SHA-256 {registerEntry.sha256.slice(0, 12)}…</span>
                  ) : (
                    <span className="ml-1">· fingerprint not recorded in this repository</span>
                  )}
                </p>
                <p className="mt-1">
                  {topic.requiresInterferometry
                    ? "Central measurement needs interferometry; backscatter change alone is insufficient."
                    : "Central measurement can be approached with backscatter change, with the limits above."}
                </p>
              </div>
            </article>
          );
        })}
      </div>

      <footer className="mt-6 rounded-lg border border-slate-700/80 bg-[#111a24] p-5 text-xs leading-5 text-slate-400">
        <h2 className="text-sm font-semibold text-slate-200">Source register</h2>
        <p className="mt-2">
          The machine-readable register is at{" "}
          <a className="text-sky-300 underline underline-offset-2" href="/resources/source-register.json">
            /resources/source-register.json
          </a>
          . It records the supplied filenames and states plainly where a fingerprint, page count or publication
          year has not been verified. It is not an exhaustive bibliography of those papers&apos; citations, and no
          dataset is treated as integrated merely because a paper mentions it.
        </p>
      </footer>
    </main>
  );
}
