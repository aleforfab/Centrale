import { AppShell } from "@/components/AppShell";

export default function MethodPage() {
  return <AppShell current="/method" eyebrow="Method & provenance" title="Method" subtitle="Measured backscatter change, exact dates.">
    <section className="plate mb-6"><div className="plate__header"><span className="plate__tag">01 — Observations</span></div><div className="plate__body space-y-4">
      <p>Installed NISAR L2 GCOV products show detected amplitude only; GCOV does not carry phase. Brighter grayscale indicates a stronger radar return. The PROVISIONAL granules may be reprocessed.</p>
      <p>The Anak Krakatau site contains five HH acquisitions, from 2026-08-13 through 2026-09-30, twelve days apart. The stack is ascending, track 10, frame 175, CRID P05023, at 10 m in EPSG:32748. The manifest is the source for the installed dates, products and caveat.</p>
      <p>NASA reports that early-September lava reached the western and southwestern coasts. This is context, not a classification of our radar pixels. Read <a href="https://www.earthdata.nasa.gov/news/worldview-image-archive/anak-krakatau-grows" target="_blank" rel="noreferrer">NASA Worldview: Anak Krakatau Grows ↗</a>.</p>
    </div></section>
    <section className="plate mb-6"><div className="plate__header"><span className="plate__tag">02 — Products and limits</span></div><div className="plate__body space-y-4">
      <p>Difference products show finish minus start in dB for installed consecutive pairs only. Masks are categorical: blue means lower return and red means higher return. A 6 dB mask is the recommended starting threshold; the 2 dB mask can be dominated by open-water speckle. Radar return changes alone do not establish their cause.</p>
      <p>The browser displays precomputed products; it does not calculate differences, substitute dates or interpolate frames. Satellite basemap imagery is context, not a matched-date observation. The optional procedural demo is not an observation.</p>
    </div></section>
  </AppShell>;
}
