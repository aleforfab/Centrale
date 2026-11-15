# Dancing with the SARs — a beginner course

A practical introduction to radar remote sensing for people who are new to it,
written to accompany this repository. It explains what the tool measures, how the
pipeline works, and — just as importantly — what the output does **not** prove.

Every number and every claim here should be checked against current mission
documentation before you quote it in a submission. Software documentation ages;
mission documentation is authoritative.

---

## 1. What radar actually sees

A camera records sunlight reflected from a surface. A radar records its own
pulse after it bounces back. That difference matters:

- **It supplies its own energy.** Radar works at night and through cloud, which
  is why it is used for floods, storms and tropical regions where optical imagery
  is often blocked.
- **It is sensitive to geometry and moisture, not colour.** Brightness depends on
  how rough the surface is at the scale of the wavelength, how wet it is, and how
  the pulse hits it.
- **It measures distance.** The time delay of the returning pulse gives range;
  the phase of the wave gives a far more precise measurement than the pixel size,
  which is what enables interferometry.

Sentinel-1, NISAR, ICEYE and Capella are all radar satellites. This project uses
NISAR products, but nearly everything below applies to any SAR.

### Side-looking geometry and its artefacts

A SAR looks sideways, not straight down. That produces effects you must recognise
before interpreting anything:

- **Layover:** a tall feature is imaged before the ground in front of it, so
  mountain tops can appear displaced toward the sensor.
- **Shadow:** the far side of a ridge receives no pulse and returns nothing. It
  looks like a very dark area, and it is not water.
- **Foreshortening:** slopes facing the sensor are compressed.

In steep terrain, brightness differences between two dates can come purely from
geometry. That is one reason the applications library marks glacier and volcano
topics as needing more than backscatter.

---

## 2. NISAR and the GCOV product in this repository

NISAR is a joint NASA–ISRO mission carrying an L-band SAR (wavelength roughly
24 cm), designed with a repeating ground track so that the same area is imaged
from a similar geometry again and again. That repeat is what makes a time series
possible: comparisons are only meaningful when geometry is comparable.

The pipeline here works with **Level-2 GCOV** products: geocoded covariance data
delivered on a map grid, in linear power units. Three consequences:

1. **It is already geocoded.** Pixels fall on a map projection, so you can place
   them on a basemap.
2. **It is power, not phase.** GCOV carries brightness information. Ground
   displacement from phase is a different product class and a different method.
3. **It is a grid, not a photograph.** Neighbouring pixels are correlated
   (speckle), and the grid has a defined spacing recorded in the file.

The repository does **not** assume a particular pixel spacing. It reads the
coordinate arrays and spacing from the file, because assuming "about 10 metres"
and being wrong silently corrupts every area statistic.

### Polarization

Radar transmits and receives in a polarization, conventionally H (horizontal) or
V (vertical). HH means transmit H, receive H. HV means transmit H, receive V.

- **Like-polarized (HH, VV):** strong over smooth water at low incidence, strong
  over bare soil, sensitive to surface roughness.
- **Cross-polarized (HV, VH):** weak over smooth surfaces, strong over vegetation
  volume scattering.

Cross-polarized data is often the most useful for separating vegetation from open
water. This is why the pipeline processes each polarization separately and why
the comparison viewer refuses to mix them: an HH layer is not a substitute for a
missing HV layer.

---

## 3. Reading an HDF5 GCOV file

GCOV files are HDF5 containers. The backend reads:

```text
science/LSAR/GCOV/grids/frequencyA/xCoordinates
science/LSAR/GCOV/grids/frequencyA/yCoordinates
science/LSAR/GCOV/grids/frequencyA/projection
science/LSAR/GCOV/grids/frequencyA/HHHH
science/LSAR/GCOV/grids/frequencyA/HVHV
science/LSAR/GCOV/grids/frequencyA/mask
```

Things beginners get wrong here:

- **The arrays are 2-D but the coordinates are 1-D.** Row/column order matters:
  if `yCoordinates` is stored descending, a "north-up" transform needs care.
- **Projection metadata varies.** Sometimes there is an EPSG code attribute,
  sometimes a WKT string. The reader accepts both, and fails loudly rather than
  guessing.
- **The mask is not self-documenting.** A value of 1 might mean "invalid",
  "unverified", or something product-specific. This repository preserves mask
  values raw and does not claim to know their meaning. Treat that as an open
  question, not an inconvenience.
- **Do not trust the filename for everything.** Track, frame, direction and dates
  are usually encoded in the granule name; the pipeline parses the name rather
  than relying on service metadata that may be inconsistent.

---

## 4. Power, decibels and why the data is smoothed

Radar backscatter spans several orders of magnitude. Displaying it linearly would
show almost nothing. Convert to decibels:

```text
dB = 10 * log10(power)
```

Rules that follow from the maths:

- Zero and negative power have no dB value. They must become "no data", not
  `-inf` or a very negative number that later looks like real darkness.
- Averaging in dB is not the same as averaging in power. A pixel showing the mean
  of two dB values is not the mean power. The pipeline smooths in **linear
  power** first, then converts, and there is a test that pins this.
- A 3 dB difference is roughly a factor of two in power. A 10 dB difference is a
  factor of ten.

Speckle — the salt-and-pepper look of SAR imagery — is statistical, not noise to
be deleted. Boxcar smoothing reduces it but also blurs edges. That trade-off is a
choice, recorded as `smoothing_px` in the site configuration.

---

## 5. Difference layers, thresholds and their failure modes

The core product is a difference:

```text
difference_dB = backscatter_after_dB - backscatter_before_dB
```

Then a threshold turns that into a mask: for example, every pixel below −3 dB is
"lower return", every pixel above +3 dB is "higher return".

What this genuinely supports:

- "In this footprint, this fraction of valid pixels showed a drop larger than
  3 dB between these two acquisitions."

What it does not support:

- "This area flooded." A drop can be open water, smooth dry sand, a ploughed
  field, a harvested crop, radar shadow, or a change in viewing geometry.
- "Damage was 40%." A percentage of pixels crossing a threshold is not a damage
  grade.
- "The ground subsided 4 cm." Centimetres require phase, not brightness.

Three failure modes to look for in your own results:

1. **Threshold shopping.** Trying 1, 2, 3, 6 dB and reporting the one that looks
   most like the story you wanted. Report the sensitivity instead.
2. **Ignoring validity.** If 30% of the footprint is masked out, a percentage over
   "the area" is misleading. Always state the valid fraction.
3. **Confusing bins with categories.** A histogram of differences is a
   distribution of measurements, not a set of semantic classes.

---

## 6. Masks and missing data

Masks decide which pixels are allowed to influence a statistic. Getting them wrong
is one of the most common ways an analysis becomes confidently wrong.

A worked example from this repository's own history: the smoothing routine once
multiplied the data by the validity mask before averaging. In Python, `NaN * 0`
is still `NaN`, so a single invalid pixel erased its entire neighbourhood. On
synthetic data with 5% scattered gaps, 1528 valid pixels collapsed to 54, and one
acquisition lost every valid pixel, aborting the build. The fix was to replace
invalid values with 0 before averaging and to keep genuinely empty windows as
"no data".

The lesson generalises: **a gap must stay a gap.** If an empty window is silently
converted to zero power, the resulting image looks plausible and is wrong.

---

## 7. From measurement to interpretation

A useful discipline, and the one this repository tries to enforce:

```text
Observation  → a measurement you can reproduce from the files
Hypothesis   → a proposed cause
Evidence     → something independent that discriminates between hypotheses
Claim        → the statement you publish, scoped to what the evidence supports
```

Example:

- Observation: HV backscatter fell by more than 4 dB over a contiguous 12 km²
  area between two named acquisitions.
- Hypothesis: standing water under vegetation.
- Evidence needed: optical imagery on comparable dates, river gauge records, or
  field reports.
- Claim: "HV backscatter dropped sharply in this area between these dates; this
  is consistent with, but does not establish, inundation."

The applications library in the app exists to keep those levels separate for each
topic.

---

## 8. How the pipeline fits together

```text
discover     list candidate stacks from the archive
build-site   read granules, compute statistics, write COGs, tiles and JSON
verify       check the product tree is internally consistent
serve        FastAPI exposes the products; Next.js displays them
```

What each step can and cannot tell you:

| Step | Can tell you | Cannot tell you |
| --- | --- | --- |
| `discover` | Which granules exist for a footprint | Whether the data is useful, complete, or already downloaded |
| `build-site` | That layers were produced from the inputs given | That the inputs were compatible or the thresholds sensible |
| `verify` | That files exist, parse, and agree with the manifest | That any interpretation is correct |
| Page loads | That the UI can read the products | That the imagery is scientifically meaningful |

That table is the reason the project status distinguishes "tested on synthetic
data" from "scientifically reviewed for this case".

---

## 9. Choosing a case study

A good first case has these properties:

- Small, so the tile budget stays modest.
- A **documented** event with a date you can look up independently.
- Two acquisitions on the same track, frame, direction and maturity, straddling
  the event.
- Not in extreme terrain, where layover and shadow complicate everything.
- A place where you can find independent context (reports, gauges, imagery).

Avoid starting with the topic you find most exciting if it needs interferometry.
Glacier velocity, subsidence, sinkholes and earthquakes all need phase or offset
tracking. Backscatter differences will not deliver them, and presenting them as if
they do is the fastest way to lose credibility with a judge who knows radar.

---

## 10. Hosting, simply

For a weekend project:

- One modest Linux VM is enough: Python, Node.js, a reverse proxy.
- Bind the backend and the frontend to loopback; expose only ports 80 and 443
  through the proxy.
- Keep products on disk outside the source tree.
- Process data ahead of time; never let a public page trigger a download.
- A URL-restricted public Mapbox token is fine for the basemap; a private secret
  token never belongs in a frontend bundle.
- Budget alerts warn you; they do not stop spending.

On this project's VM the frontend proxies `/api` and `/products` to the backend on
the server side, so the browser only ever talks to one origin.

---

## 11. Judging and submission: what actually earns marks

The published criteria are usually variants of impact, creativity, validity,
relevance and presentation. Practical translations:

- **Validity** is where radar projects fail. One carefully scoped observation
  with a stated limitation is more useful than five overclaimed hazard maps.
- **Impact** needs a named user and a specific decision they could make, not
  "this could help many sectors".
- **Creativity** is often in the presentation: a reveal slider that forces a
  like-for-like comparison is more convincing than an animated overlay with three
  unlabelled layers.
- **Relevance** means answering the challenge that was actually set.
- **Presentation** means a visitor understands in ten seconds what they are
  looking at, and what it does not show.

Be explicit about what was pre-existing and what was built during the event. If
the rules require it, say so in the submission text rather than hoping nobody
asks.

---

## 12. Troubleshooting

| Symptom | Likely cause | What to check |
| --- | --- | --- |
| `No valid pixels in time-series acquisition` | Every pixel invalid after masking or smoothing | Mask semantics, smoothing kernel, whether the window is inside the data |
| Site builds but the map is blank | No Mapbox token, or tiles 404 | Browser console, `/products/...` URLs, backend proxy |
| `Estimates exceed configured budget` | Zoom range too wide for the footprint | Reduce `max_zoom` or the bbox |
| `Configured pair dates are missing from the selected stack` | Pair dates and stack granules disagree | Re-run `discover`, check the granule dates verbatim |
| Statistics look implausible | Wrong bbox, wrong polarization, or heavy masking | Valid fraction, stretch values, layer ids |
| Everything is `null` in the register | PDFs not present locally | Run the register builder against your own files |

---

## 13. Exercises

1. Convert linear power 0.05 and 0.5 to dB. What is the difference?
2. A footprint has 40,000 pixels; 9,000 are masked. What fraction is valid, and
   why does the report need that number?
3. Two acquisitions show a −5 dB change over a river bend. Write one observation
   sentence and one hypothesis sentence, keeping them separate.
4. Why can an HH layer not stand in for a missing HV layer in a comparison?
5. Why is a mask value of 1 not automatically "invalid"?
6. Your `verify` passes on a synthetic site. List three things that still are not
   established.
7. Name one topic in the applications library that backscatter differences cannot
   address, and the measurement that would be needed instead.

### Answers

1. 0.05 → −13.0 dB; 0.5 → −3.0 dB; the difference is 10 dB, a factor of ten in
   power.
2. 31,000 / 40,000 = 77.5% valid. Without it, a percentage of "the area" hides
   that almost a quarter of the footprint contributed nothing.
3. Observation: "HV backscatter in the river bend dropped by about 5 dB between
   the two named acquisitions." Hypothesis: "The drop may be consistent with
   standing water; it could also be a change in surface roughness or moisture."
4. Because polarization changes what the radar measures; substituting silently
   changes the physical quantity and invalidates any comparison.
5. Because mask conventions are product-specific; the meaning must come from
   documentation or evidence, not from a guess.
6. That the inputs were compatible, that the thresholds were sensible, and that
   anything about the scene is true. (Also acceptable: no real data at all.)
7. For example glaciers (needs InSAR or offset tracking), or sinkholes (needs
   deformation time series).

---

## 14. Glossary

- **Backscatter:** energy returned to the radar from a surface.
- **COG:** Cloud-Optimized GeoTIFF, a tiled and overviewed raster format.
- **dB:** decibel, `10 * log10(power)`.
- **GCOV:** geocoded covariance product, delivered on a map grid in linear power.
- **Granule:** one delivered data file for one acquisition.
- **InSAR:** interferometric SAR, uses phase to measure deformation.
- **Mask:** a layer marking which pixels are usable, with product-specific meaning.
- **NISAR:** joint NASA–ISRO L-band SAR mission.
- **Polarization (HH/HV):** transmit and receive polarizations.
- **Speckle:** statistical granularity inherent to coherent imaging.
- **Stack:** acquisitions sharing track, frame, direction and processing identity.
- **Threshold:** the dB cut-off that turns a difference into a mask.

---

## 15. Where to read further

- The mission's own product and data documentation, for authoritative definitions.
- The ASF DAAC for data discovery and access instructions.
- The application white papers listed in the source register for domain context —
  remembering that several are pre-launch documents whose expectations should be
  checked against current documentation.
- This repository's `docs/` for what the code actually does, rather than what it
  is hoped to do.
