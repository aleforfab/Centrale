import { AppShell } from "@/components/AppShell";

export default function MethodPage() {
  return (
    <AppShell current="/method" eyebrow="Method & honesty register" title="Method" subtitle="Written for outsiders — a skeptical journalist, a reviewer, a judge. What this application is, what it is not, and what the numbers can and cannot say.">

      {/* Section 01 */}
      <section className="plate" style={{ marginBottom: "28px" }}>
        <div className="plate__header">
          <span className="plate__tag">01 — Why this exists</span>
          <span className="plate__right-tag">scope</span>
        </div>
        <div className="plate__body space-y-4">
          <p>This application was built for the NASA Space Apps Challenge. It displays installed NISAR L-band Geocoded Polarimetric Covariance (GCOV) products — backscatter observations only. No other product type is shown as an observation.</p>
          <p>Live fetch from ASF/NASA Earthdata is operator-side. The application never initiates a download implicitly; an authenticated operator must press a button and confirm a bounding box. The backend downloads, reads, and builds tile products from the HDF5 granules; the frontend requests the resulting manifest and renders tiles.</p>
          <p>The installed product stack for the Anak Krakatau case — five ascending-frame-010 acquisitions, August–September 2026 — is documented as <strong>planned, not executed</strong>. Gate 2 (VM go-live) has not been approved. No real granule has been downloaded or processed in this workspace.</p>
        </div>
      </section>

      {/* Section 02 */}
      <section className="plate" style={{ marginBottom: "28px" }}>
        <div className="plate__header">
          <span className="plate__tag">02 — The data</span>
          <span className="plate__right-tag">NISAR · L-band · GCOV</span>
        </div>
        <div className="plate__body space-y-4">
          <p>Source: NASA ASF Earthdata. Collection <code style={{ fontFamily: "var(--font-mono)", fontSize: "12px" }}>NISAR_L2_GCOV_PROVISIONAL_V1</code> (CMR concept <code style={{ fontFamily: "var(--font-mono)", fontSize: "12px" }}>C2854338529-ASF</code>). Maturity: <strong>PROVISIONAL</strong> — not validated, not reviewed.</p>

          <table className="rule-table">
            <thead>
              <tr><th>Date (UTC)</th><th>Orbit</th><th>Frame</th><th>CRID</th><th>Size (MB)</th></tr>
            </thead>
            <tbody>
              <tr><td>2026-08-13</td><td>5472</td><td>010</td><td>P05023</td><td>4 848</td></tr>
              <tr><td>2026-08-25</td><td>5645</td><td>010</td><td>P05023</td><td>4 860</td></tr>
              <tr><td>2026-09-06</td><td>5818</td><td>010</td><td>P05023</td><td>4 853</td></tr>
              <tr><td>2026-09-18</td><td>5991</td><td>010</td><td>P05023</td><td>4 848</td></tr>
              <tr><td>2026-09-30</td><td>6164</td><td>010</td><td>P05023</td><td>4 856</td></tr>
            </tbody>
          </table>

          <p>Ascending track 028→032, frame 010, L-band (frequency A), HH+HV polarization (encoded as <code style={{ fontFamily: "var(--font-mono)", fontSize: "12px" }}>DHDH</code> in granule names, representing HHHH/HVHV covariance terms). Wavelength approximately 24 cm. 12-day repeat cycle.</p>

          <p>Total download: approximately <strong>24.27 GB</strong> (SI). The VM runbook is documented in <code style={{ fontFamily: "var(--font-mono)", fontSize: "12px" }}>docs/ANAK_KRAKATAU_VM_BUILD.md</code>. <strong>The download has not been executed in this workspace.</strong></p>

          <p>Validated collection <code style={{ fontFamily: "var(--font-mono)", fontSize: "12px" }}>NISAR_L2_GCOV_V1</code> over the AOI currently shows a 2026-10-24 granule (<code style={{ fontFamily: "var(--font-mono)", fontSize: "12px" }}>P05036_N_F_J_001</code>, approximately 4.98 GB); no August–September 2026 epochs were found in the queried window. <code style={{ fontFamily: "var(--font-mono)", fontSize: "12px" }}>NISAR_L2_GCOV_BETA_V1</code>: none.</p>
        </div>
      </section>

      {/* Section 03 */}
      <section className="plate" style={{ marginBottom: "28px" }}>
        <div className="plate__header">
          <span className="plate__tag">03 — Processing</span>
          <span className="plate__right-tag">gamma → sigma</span>
        </div>
        <div className="plate__body space-y-4">
          <p>Angle normalization: γ⁰ → σ⁰ via <code style={{ fontFamily: "var(--font-mono)", fontSize: "12px" }}>rtcGammaToSigmaFactor</code> (per-pixel float32 grid in real products, per NISAR Data Product Format Document V1.2.1, eq. 7), applied before dB conversion. Convention: σ⁰ = γ⁰ × rtcGammaToSigmaFactor.</p>
          <p>Smoothing: 3 px kernel. Thresholds: 2 / 3 / 6 dB for change detection bins; default threshold 3 dB.</p>
          <p>Statistics displayed in the dashboard are measured outputs — decrease and increase area, valid pixel fraction, noise floor. They are not causes. The application does not claim that a measured change is caused by an eruption, a landslide, or any specific event.</p>
          <p>Tile-stack coherence (stack match, maturity, tiles present) is enforced only for tile generation via <code style={{ fontFamily: "var(--font-mono)", fontSize: "12px" }}>nisar.cli verify</code>. It is not a scientific quality flag.</p>
        </div>
      </section>

      {/* Section 04 */}
      <section className="plate" style={{ marginBottom: "28px" }}>
        <div className="plate__header">
          <span className="plate__tag">04 — What it is not</span>
          <span className="plate__right-tag">refusals</span>
        </div>
        <div className="plate__body space-y-4">
          <div className="colophon">
            <strong>This application is not:</strong>
            <ul style={{ margin: "8px 0 0", paddingLeft: "20px", lineHeight: 1.7 }}>
              <li>A cause. Measured backscatter differences are outputs, not explanations.</li>
              <li>An interpolation. Dates that are missing stay missing. No gap-filling, no synthetic frames between real acquisitions.</li>
              <li>Validated science. Maturity is PROVISIONAL; products may be reprocessed by NASA.</li>
              <li>A deformation or InSAR product. Interferometry is <strong>proposed</strong> — the phase-capable chain exists as library code but is off-limits until verified on real data. No deformation, coherence, or displacement is computed or displayed.</li>
              <li>A real observation in the demo path. The procedural Time Machine demo frames are generated for interaction testing only; they are not NISAR observations, not a real change, and not evidence of anything.</li>
              <li>Matched-date optical context. The basemap imagery (Mapbox satellite-streets) is context only; it is never the observation. The observation is the SAR backscatter tile.</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Section 05 */}
      <section className="plate" style={{ marginBottom: "28px" }}>
        <div className="plate__header">
          <span className="plate__tag">05 — Known limits</span>
          <span className="plate__right-tag">constraints</span>
        </div>
        <div className="plate__body space-y-4">
          <table className="rule-table">
            <thead>
              <tr><th>Limit</th><th>Detail</th></tr>
            </thead>
            <tbody>
              <tr><td>PROVISIONAL maturity</td><td>Not validated, not reviewed. Products may be reprocessed.</td></tr>
              <tr><td>No coherence / displacement</td><td>InSAR chain is proposed; not available from GCOV backscatter pipeline.</td></tr>
              <tr><td>Exact dates only</td><td>The calendar refuses non-installed dates; no interpolation, no substitution.</td></tr>
              <tr><td>Out-of-extent tiles</td><td>Return 404 by design; no error tiles or placeholder imagery.</td></tr>
              <tr><td>Attribution retained</td><td>Mapbox and NISAR/ASF attribution is never removed or obscured.</td></tr>
              <tr><td>Single-pass geometry</td><td>No multi-angle compositing; each frame is one acquisition.</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 06 */}
      <section className="plate" style={{ marginBottom: "28px" }}>
        <div className="plate__header">
          <span className="plate__tag">06 — Provenance</span>
          <span className="plate__right-tag">sources · 2026-11-14</span>
        </div>
        <div className="plate__body space-y-4">
          <p>Every external statement in this register carries its verification date: <strong>2026-11-14</strong>. The granule inventory was confirmed via read-only NASA CMR queries; no granule was downloaded in this workspace.</p>

          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            <li className="index-row">
              <span>ASF granule search</span>
              <a href="https://search.asf.alaska.edu/#/?maxResults=10&dataset=NISAR" target="_blank" rel="noopener noreferrer" style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--accent)" }}>search.asf.alaska.edu ↗</a>
            </li>
            <li className="index-row">
              <span>NASA Worldview</span>
              <a href="https://worldview.earthdata.nasa.gov/" target="_blank" rel="noopener noreferrer" style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--accent)" }}>worldview.earthdata.nasa.gov ↗</a>
            </li>
            <li className="index-row">
              <span>Normalization docs</span>
              <code style={{ fontFamily: "var(--font-mono)", fontSize: "11px" }}>docs/NORMALIZATION.md</code>
            </li>
            <li className="index-row">
              <span>VM build runbook</span>
              <code style={{ fontFamily: "var(--font-mono)", fontSize: "11px" }}>docs/ANAK_KRAKATAU_VM_BUILD.md</code>
            </li>
            <li className="index-row">
              <span>Agent-team reports</span>
              <code style={{ fontFamily: "var(--font-mono)", fontSize: "11px" }}>agent-team/reports/</code>
            </li>
            <li className="index-row">
              <span>Source repository</span>
              <a href="https://github.com/aleforfab/Centrale" target="_blank" rel="noopener noreferrer" style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--accent)" }}>github.com/aleforfab/Centrale ↗</a>
            </li>
          </ul>

          <div className="footnote" style={{ marginTop: "16px" }}>
            This honesty register is a living document. If a claim here is contradicted by a later verification, the register is updated — not the UI copy silently.
          </div>
        </div>
      </section>

    </AppShell>
  );
}
