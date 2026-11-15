import { AppShell } from "@/components/AppShell";

export default function MethodPage() {
  return <AppShell current="/method" eyebrow="Method & provenance" title="Method" subtitle="How the installed radar layers are prepared.">
    <section className="plate mb-6"><div className="plate__header"><span className="plate__tag">01 — Observations</span></div><div className="plate__body space-y-4">
      <p>NISAR L2 GCOV provides detected radar amplitude. Each observation is shown as a dated backscatter layer; brighter grayscale values indicate a stronger radar return. The installed products are marked PROVISIONAL.</p>
      <p>The Anak Krakatau site contains five HH acquisitions, from 2026-08-13 through 2026-09-30, twelve days apart. The stack is ascending, track 10, frame 175, CRID P05023, at 10 m in EPSG:32748. The manifest lists the available dates and products.</p>
      <p>NASA reports that early-September lava reached the western and southwestern coasts. Read <a href="https://www.earthdata.nasa.gov/news/worldview-image-archive/anak-krakatau-grows" target="_blank" rel="noreferrer">NASA Worldview: Anak Krakatau Grows ↗</a>.</p>
    </div></section>
    <section className="plate mb-6"><div className="plate__header"><span className="plate__tag">02 — Products</span></div><div className="plate__body space-y-4">
      <p>Difference layers show the later acquisition minus the earlier one in dB. Mask layers highlight pixels beyond a selected threshold; 6 dB is the default view.</p>
      <p>The browser displays precomputed radar layers. Optical basemap imagery provides geographic context.</p>
    </div></section>
  </AppShell>;
}
