import { paperFor } from "./sourceRegister";

/**
 * Applications library.
 *
 * Twelve topics drawn from NISAR application white papers. Each entry is an
 * educational summary: what a radar time series can show, what it cannot show,
 * and which additional methods a specialised analysis would need.
 *
 * Nothing here is a working hazard detector, and no entry is awarded a
 * "validated" label automatically. See CAPABILITY definitions below.
 */

export type Capability = "learning-resource" | "exploratory-case" | "validated-for-this-case";

export interface CapabilityDefinition {
  id: Capability;
  label: string;
  meaning: string;
}

export const CAPABILITIES: Record<Capability, CapabilityDefinition> = {
  "learning-resource": {
    id: "learning-resource",
    label: "Learning resource",
    meaning:
      "An educational topic. The repository explains what this kind of observation can show. Nothing on this topic is installed, processed for a real case, or validated.",
  },
  "exploratory-case": {
    id: "exploratory-case",
    label: "Exploratory case",
    meaning:
      "Real observations for this topic are installed and can be inspected. Interpretation still needs independent checks, and no scientific claim is settled.",
  },
  "validated-for-this-case": {
    id: "validated-for-this-case",
    label: "Validated for this case",
    meaning:
      "A documented review exists for one specific case: reviewer, scope, evidence and limitations. The label applies only to that case, never to the topic in general.",
  },
};

export interface ApplicationTopic {
  id: string;
  title: string;
  registerId: string;
  sourceFilename: string;
  /** One or two sentences on what the mission measures for this topic. */
  summary: string;
  /** Observations a backscatter or interferometric time series can genuinely support. */
  exploration: string[];
  /** What the data cannot establish, or where a claim would be premature. */
  limitations: string[];
  /** Methods a specialised study would need beyond GCOV backscatter differences. */
  methodsNeeded: string[];
  /** True when a report of this analysis actually needs phase/InSAR data. */
  requiresInterferometry: boolean;
}

export const APPLICATIONS: ApplicationTopic[] = [
  {
    id: "flooding",
    title: "Flooding",
    registerId: "flooding",
    sourceFilename: "nisarflooding.pdf",
    summary:
      "Open water usually returns much less radar energy than the surrounding vegetation or built-up ground, so a date pair around an event can show a large drop in backscatter over inundated ground.",
    exploration: [
      "Compare pre-event and post-event backscatter for the same track, frame and polarization.",
      "Look at where the drop is coherent across neighbouring pixels rather than isolated speckle.",
      "Check whether the low-return area follows terrain, channels or field boundaries.",
    ],
    limitations: [
      "A backscatter drop is not a flood map; smooth dry sand, calm water, roads and radar shadow can look similar.",
      "Dense vegetation can hide water below the canopy, so under-detection is expected.",
      "Wind roughening the water surface raises backscatter and can hide the flood signal.",
      "The repository reports a measured difference. It does not classify an event or estimate depth.",
    ],
    methodsNeeded: [
      "Independent reference imagery or ground reports for the same dates.",
      "A documented threshold policy and a sensitivity check across thresholds.",
      "Terrain and land-cover context to separate water from other low-return surfaces.",
    ],
    requiresInterferometry: false,
  },
  {
    id: "water-and-soil-moisture",
    title: "Surface water and soil moisture",
    registerId: "water-and-soil-moisture",
    sourceFilename: "NISARwater.pdf",
    summary:
      "Soil moisture changes the dielectric properties of the surface and therefore its radar backscatter, and open water bodies behave very differently from wet soil.",
    exploration: [
      "Track how backscatter in a fixed area changes between acquisitions in a season.",
      "Check whether the change is consistent across polarizations.",
      "Compare the timing of changes with known rainfall or irrigation periods.",
    ],
    limitations: [
      "Quantitative soil-moisture retrieval needs calibrated models, field data and correction for surface roughness and vegetation.",
      "The repository computes backscatter and differences; it does not retrieve volumetric soil moisture.",
      "Surface roughness and vegetation change the signal independently of moisture.",
    ],
    methodsNeeded: [
      "A physical scattering model with local calibration.",
      "Field measurements for validation.",
      "Correction for vegetation cover and surface roughness.",
    ],
    requiresInterferometry: false,
  },
  {
    id: "coastal",
    title: "Coastal regions",
    registerId: "coastal",
    sourceFilename: "NisarCostalRegion.pdf",
    summary:
      "Coastal zones combine water, wet sediment, vegetation and infrastructure, and radar is sensitive to all of them at once.",
    exploration: [
      "Follow shoreline and intertidal backscatter through a tidal cycle if acquisitions allow.",
      "Look for persistent change near river mouths or eroding stretches.",
      "Compare low-tide and high-tide acquisitions rather than arbitrary dates.",
    ],
    limitations: [
      "Tides, wind and waves change the surface between acquisitions and can dominate the difference.",
      "Shoreline position from a coarse grid is not a surveyed coastline.",
      "Wet sand and shallow water can produce ambiguous returns.",
    ],
    methodsNeeded: [
      "Tide and weather records for each acquisition time.",
      "Higher-resolution shoreline reference data.",
      "A documented protocol for separating tidal variation from lasting change.",
    ],
    requiresInterferometry: false,
  },
  {
    id: "glaciers-and-snow",
    title: "Mountain glaciers and snow",
    registerId: "glaciers-and-snow",
    sourceFilename: "NisarAPPGLacier.pdf",
    summary:
      "Glacier surfaces change brightness with snow cover, melt and roughness, and their motion is measurable with interferometry or offset tracking rather than single-date backscatter.",
    exploration: [
      "Compare backscatter over a glacier between seasons to see the snow and melt cycle.",
      "Identify areas whose brightness changes repeatedly with the season.",
    ],
    limitations: [
      "Glacier velocity is not obtainable from GCOV backscatter differences.",
      "Steep terrain causes layover and shadow that change with viewing geometry.",
      "Snow wetness changes the signal strongly and is not the same as mass balance.",
    ],
    methodsNeeded: [
      "Interferometry or offset tracking for motion.",
      "Elevation models for terrain correction.",
      "A glaciological interpretation by a specialist.",
    ],
    requiresInterferometry: true,
  },
  {
    id: "landslides",
    title: "Landslides",
    registerId: "landslides",
    sourceFilename: "nisarLandslide.pdf",
    summary:
      "A landslide changes surface cover and geometry abruptly, which can appear as a backscatter change between a pre-event and post-event acquisition.",
    exploration: [
      "Compare the same area before and after a known event date.",
      "Check that the changed area matches a slope rather than flat ground.",
      "Look for a change that persists into later acquisitions.",
    ],
    limitations: [
      "Backscatter change locates a difference; it does not identify a landslide mechanism.",
      "Vegetation growth, harvest and construction produce similar changes.",
      "Slow-moving slopes need interferometric methods, not backscatter differences.",
    ],
    methodsNeeded: [
      "Interferometry or pixel offset tracking for slow deformation.",
      "Slope and geology context.",
      "Event records to anchor the date pair.",
    ],
    requiresInterferometry: false,
  },
  {
    id: "volcanoes",
    title: "Volcanoes",
    registerId: "volcanoes",
    sourceFilename: "nisarmonitoringVolcan.pdf",
    summary:
      "Volcanic surfaces change with eruptions, ash, lava and hydrothermal alteration, while magma movement produces ground deformation that requires interferometry.",
    exploration: [
      "Compare backscatter on the edifice before and after a documented eruption.",
      "Track seasonal snow and alteration patterns on the summit.",
    ],
    limitations: [
      "Volcanic unrest cannot be inferred from backscatter change alone.",
      "Deformation requires InSAR time series and atmospheric correction.",
      "Ash fall and lava flows need to be distinguished with independent information.",
    ],
    methodsNeeded: [
      "Interferometric time series for deformation.",
      "Thermal or optical imagery for thermal anomalies.",
      "Volcano observatory records.",
    ],
    requiresInterferometry: true,
  },
  {
    id: "sinkholes",
    title: "Sinkholes",
    registerId: "sinkholes",
    sourceFilename: "nisarsinkhole.pdf",
    summary:
      "Subsidence before a collapse is a millimetre-to-centimetre ground motion, which is a phase measurement rather than a brightness measurement.",
    exploration: [
      "Compare backscatter where a collapse has already been documented.",
      "Look for surface change around known karst areas.",
    ],
    limitations: [
      "Sinkholes cannot be predicted from this pipeline.",
      "Small precursors are far below what a backscatter difference can resolve.",
      "Coherent InSAR requires stable scattering, which vegetation and excavation remove.",
    ],
    methodsNeeded: [
      "InSAR deformation time series with atmospheric correction.",
      "Geological and hydrological context.",
      "Ground surveys or borehole data.",
    ],
    requiresInterferometry: true,
  },
  {
    id: "permafrost",
    title: "Terrestrial permafrost",
    registerId: "permafrost",
    sourceFilename: "nisarterrestialperma.pdf",
    summary:
      "Thaw changes soil moisture, surface roughness and vegetation, and can cause ground subsidence that is again a phase measurement.",
    exploration: [
      "Track seasonal backscatter cycles in permafrost terrain.",
      "Compare the same tundra area across thaw seasons.",
    ],
    limitations: [
      "Active-layer thickness is not measured by backscatter differences.",
      "Freeze-thaw transitions change the signal strongly and quickly.",
      "Subsidence requires InSAR and careful correction for vegetation.",
    ],
    methodsNeeded: [
      "InSAR time series for subsidence.",
      "Soil temperature and active-layer monitoring data.",
      "Land-cover classification.",
    ],
    requiresInterferometry: true,
  },
  {
    id: "earthquakes-and-tectonics",
    title: "Plate tectonics and earthquakes",
    registerId: "earthquakes-and-tectonics",
    sourceFilename: "nisarEarth.pdf",
    summary:
      "Coseismic and interseismic deformation are measured from interferometric phase, not from backscatter brightness.",
    exploration: [
      "Compare backscatter over a rupture zone where surface material actually changed.",
      "Use the installed site to inspect acquisition geometry and coverage over a tectonically active area.",
    ],
    limitations: [
      "Ground displacement in centimetres is not derived by this pipeline.",
      "Large gradients cause phase decorrelation and unwrapping difficulty.",
      "Backscatter change after an earthquake mixes damage, dust and vegetation effects.",
    ],
    methodsNeeded: [
      "Interferometric processing (unwrapped phase, deformation maps).",
      "Elastic dislocation or fault models for interpretation.",
      "GNSS or survey data for validation.",
    ],
    requiresInterferometry: true,
  },
  {
    id: "human-induced-earthquakes",
    title: "Human-induced earthquakes",
    registerId: "human-induced-earthquakes",
    sourceFilename: "nisarinductedearthquake.pdf",
    summary:
      "Induced seismicity studies relate small ground motions to injection or extraction activity, which needs dense deformation measurements and operational records.",
    exploration: [
      "Inspect coverage and acquisition cadence over an area with documented induced events.",
    ],
    limitations: [
      "Attributing seismicity to human activity requires operational data this repository does not hold.",
      "The deformation signals are small and require InSAR time series.",
      "Statistical association is not proof of causation.",
    ],
    methodsNeeded: [
      "InSAR time series at high temporal sampling.",
      "Injection and extraction well records.",
      "Seismicity catalogues.",
    ],
    requiresInterferometry: true,
  },
  {
    id: "texas-hazards",
    title: "Natural and manmade hazards in Texas",
    registerId: "texas-hazards",
    sourceFilename: "nisarManmadeHasardTexas.pdf",
    summary:
      "A regional overview covering hurricanes and flooding, subsidence, oil and gas activity and coastal change in one state.",
    exploration: [
      "Pick one documented hazard in the region and inspect a matching acquisition pair.",
      "Compare urban subsidence areas using InSAR where products are available.",
    ],
    limitations: [
      "A regional overview is not a hazard assessment for any specific location.",
      "Each hazard type needs its own method; one threshold map does not cover them all.",
      "Hurricane effects mix wind damage, flooding and debris.",
    ],
    methodsNeeded: [
      "Per-hazard processing chains.",
      "State and local records for event dates.",
      "InSAR for subsidence.",
    ],
    requiresInterferometry: false,
  },
  {
    id: "disaster-damage",
    title: "Disaster damage assessment",
    registerId: "disaster-damage",
    sourceFilename: "nisarDisaster.pdf",
    summary:
      "Damage assessment compares pre-event and post-event observations of the built environment, ideally with reference imagery and field verification.",
    exploration: [
      "Compare a city block's backscatter before and after a documented event.",
      "Check whether changes cluster along streets, rivers or construction sites.",
    ],
    limitations: [
      "The repository does not produce a damage assessment or a damage grade.",
      "New construction, demolition, vehicles and vegetation produce similar changes.",
      "Radar alone cannot distinguish structural damage from debris or cleanup.",
    ],
    methodsNeeded: [
      "Very-high-resolution optical reference imagery.",
      "Field or authority damage reports.",
      "Building-footprint GIS data.",
    ],
    requiresInterferometry: false,
  },
];

/** Case reviews that would justify a stronger capability label. None exist yet. */
export interface CaseReview {
  applicationId: string;
  reviewer: string;
  scope: string;
  evidence: string;
  limitations: string;
}

export const CASE_REVIEWS: CaseReview[] = [];

/**
 * Capability for a topic is derived, never declared by hand.
 * With no recorded review, every topic stays a learning resource.
 */
export function capabilityFor(topicId: string, reviews: CaseReview[] = CASE_REVIEWS): Capability {
  return reviews.some((review) => review.applicationId === topicId)
    ? "validated-for-this-case"
    : "learning-resource";
}

/** Register entry backing a topic, or undefined when the filename is not registered. */
export function registerEntryFor(topic: ApplicationTopic) {
  return paperFor(topic.registerId);
}

export function topicsRequiringInterferometry(): ApplicationTopic[] {
  return APPLICATIONS.filter((topic) => topic.requiresInterferometry);
}

/** Guard used by the UI: the library must never silently shrink. */
export function applicationCount(): number {
  return APPLICATIONS.length;
}
