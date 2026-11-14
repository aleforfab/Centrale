import React from "react";
import { AppShell } from "@/components/AppShell";

export const metadata = {
  title: "Real-case setup · Dancing with the SARs",
  description: "The gates a topic must pass before it becomes a published, interpreted case",
};

interface Gate {
  id: string;
  title: string;
  owner: string;
  required: string[];
  evidence: string;
  blockedUntil: string;
}

const GATES: Gate[] = [
  {
    id: "location",
    title: "1 · Candidate location",
    owner: "Team",
    required: [
      "A specific bounding box, small enough for a restrained tile budget.",
      "A reason this place matters to the topic.",
      "Known terrain and land-cover context.",
    ],
    evidence: "A short written rationale plus the bbox written into the site YAML.",
    blockedUntil: "The bbox is fixed; changing it later invalidates statistics already quoted.",
  },
  {
    id: "acquisitions",
    title: "2 · Actual acquisitions",
    owner: "Team, using the catalogue",
    required: [
      "Real granule names from the same track, frame, direction and maturity.",
      "Both pair dates present in that stack.",
      "Neither date inside a known instrument gap.",
    ],
    evidence: "`python -m nisar.cli discover` output saved with the site configuration.",
    blockedUntil: "A granule name is recorded verbatim; nothing is inferred from a scene identifier.",
  },
  {
    id: "resources",
    title: "3 · Resource approval",
    owner: "Team",
    required: [
      "Granule sizes checked before download.",
      "Free disk and staging overhead confirmed.",
      "Explicit approval for the download volume and any cost.",
    ],
    evidence: "A note of the expected gigabytes, the free space, and who approved it.",
    blockedUntil: "The team has agreed the volume. A download is not started by assumption.",
  },
  {
    id: "science",
    title: "4 · Scientific checks",
    owner: "A reviewer with radar background",
    required: [
      "Mask and validity semantics understood for the actual product.",
      "Grid alignment between the two dates inspected, not assumed.",
      "Threshold sensitivity examined rather than one threshold quoted.",
    ],
    evidence: "Written findings, including what remains uncertain.",
    blockedUntil: "The reviewer signs the scope and the residual doubts.",
  },
  {
    id: "build",
    title: "5 · Build and verification",
    owner: "Team",
    required: [
      "`build-site` completes on the real granules.",
      "`verify` passes.",
      "Product tree, statistics and time series inspected for plausibility.",
    ],
    evidence: "Command output and the site id, recorded in `docs/IMPLEMENTATION_VERIFICATION.md`.",
    blockedUntil: "A passing build proves the software ran, not that the interpretation is right.",
  },
  {
    id: "interpretation",
    title: "6 · Interpretation review",
    owner: "Reviewer plus team",
    required: [
      "Observation statements separated from hypotheses.",
      "Independent context gathered for the same dates where possible.",
      "Limitations written into the site caveat.",
    ],
    evidence: "A signed review naming the reviewer, the case, and the limits.",
    blockedUntil: "No claim of flooding, damage, subsidence or prediction is made from this pipeline alone.",
  },
  {
    id: "imagery",
    title: "7 · Imagery configuration",
    owner: "Team",
    required: [
      "A URL-restricted public Mapbox token in an untracked environment file.",
      "The token never committed, and never the private secret token.",
      "Basemap and raster layers checked in a real browser.",
    ],
    evidence: "A screenshot of the rendered comparison, plus the token's restriction settings.",
    blockedUntil: "Rendering is verified by a person, not assumed from a successful build.",
  },
  {
    id: "publication",
    title: "8 · Publication",
    owner: "Team",
    required: [
      "Caveat visible on the page a visitor sees.",
      "Data provenance reachable from the interface.",
      "Submission rules re-read from the current official guides.",
    ],
    evidence: "The public URL, and a statement of what is deployed and when it was checked.",
    blockedUntil: "Nothing is described as validated unless gate 6 produced a record.",
  },
];

export default function SetupPage() {
  return (
    <AppShell
      current="/setup"
      eyebrow="Evidence gates"
      title="Real-case setup"
      subtitle="Eight gates a topic must pass before it stops being a learning resource. None is recorded as passed in this repository."
      status={<span>8 gates · all status not recorded</span>}
    >

      <section className="mb-6 rounded-lg border border-amber-700/50 bg-amber-950/20 p-4 text-xs leading-5 text-amber-100/90">
        <h2 className="text-sm font-semibold text-amber-200">Current state, stated plainly</h2>
        <p className="mt-2">
          The pipeline is implemented and tested on synthetic data. No real acquisition has been processed into a
          published case, so every topic remains a learning resource and the comparison viewer will only show
          whatever site an operator has actually installed.
        </p>
      </section>

      <ol className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {GATES.map((gate) => (
          <li key={gate.id} className="rounded-lg border border-slate-700/80 bg-[#111a24] p-5">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-sm font-semibold">{gate.title}</h2>
              <span className="shrink-0 rounded border border-slate-600 bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300">
                {gate.owner}
              </span>
            </div>
            <h3 className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-sky-300">Required</h3>
            <ul className="mt-2 space-y-1.5 text-xs leading-5 text-slate-300">
              {gate.required.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-slate-500" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] leading-5 text-slate-400">
              <span className="font-semibold text-slate-300">Evidence to record: </span>
              {gate.evidence}
            </p>
            <p className="mt-1 text-[11px] leading-5 text-amber-200/80">{gate.blockedUntil}</p>
            <p className="mt-3 text-[10px] uppercase tracking-wide text-slate-600">Status: not recorded</p>
          </li>
        ))}
      </ol>

      <footer className="mt-6 rounded-lg border border-slate-700/80 bg-[#111a24] p-5 text-xs leading-5 text-slate-400">
        <h2 className="text-sm font-semibold text-slate-200">Recording a completed gate</h2>
        <p className="mt-2">
          Gates are closed by editing <code className="rounded bg-slate-800 px-1">docs/IMPLEMENTATION_VERIFICATION.md</code>{" "}
          with the reviewer, date, scope and limitations. A gate that is only &quot;believed to be done&quot; stays open.
        </p>
      </footer>
    </AppShell>
  );
}
