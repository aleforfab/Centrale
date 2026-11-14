export interface SiteSummary {
  id: string;
  title: string;
  event_type: string;
  bbox: number[];
  center: number[];
  source: SourceInfo;
  date_range: string[];
  acquisition_count: number;
  pairs: Pair[];
}

export interface SourceInfo {
  mission: string;
  band: string;
  product: string;
  maturity: string;
  crid: string;
  frequency: string;
  pixel_spacing_m: number;
  crs: string;
}

export interface Acquisition {
  granule: string;
  cycle: number;
  date: string;
  start: string;
  end: string;
  crid: string;
  coverage: string;
  polarizations: string[];
  download_url?: string | null;
  links: Record<string, string>;
}

export interface ProductLayer {
  id: string;
  kind: "backscatter" | "difference" | "change_mask";
  title?: string | null;
  pol?: string | null;
  date?: string | null;
  pair_id?: string | null;
  threshold_db?: number | null;
  tile_url_template: string;
  min_zoom: number;
  max_zoom: number;
  legend?: string | null;
}

export interface PairStats {
  valid_pixels: number;
  valid_fraction_of_bbox: number;
  decrease_km2: number;
  increase_km2: number;
  decrease_pct: number;
  increase_pct: number;
  sigma_db: number;
  median_diff_db: number;
  histogram: number[];
  resampled: boolean;
}

export interface Pair {
  id: string;
  pre: string;
  post: string;
  label: string;
  stats: Record<string, Record<string, PairStats>>;
}

export interface SiteManifest {
  site: {
    id: string;
    title: string;
    event_type: string;
    description: string;
    caveat: string;
    bbox: number[];
    center: number[];
  };
  source: SourceInfo;
  acquisitions: Acquisition[];
  polarizations: { pol: string; stretch_db: number[] }[];
  layers: ProductLayer[];
  pairs: Pair[];
}

export interface TimeSeriesPoint {
  date: string;
  cycle: number;
  backscatter_db: number;
  n_valid: number;
  maturity: string;
}

export interface DataStatus {
  primary_mission: string;
  active_source: string;
  nisar_ready: boolean;
  sites_count: number;
  message: string;
  live_fetch_enabled?: boolean;
}
