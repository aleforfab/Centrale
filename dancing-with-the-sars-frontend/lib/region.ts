export type Bbox = [number, number, number, number];

export const DEFAULT_BBOX: Bbox = [105.4, -6.15, 105.55, -6.03];

export function isValidBbox(value: unknown): value is Bbox {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((item) => typeof item === "number" && Number.isFinite(item)) &&
    value[0] < value[2] &&
    value[1] < value[3] &&
    value[0] >= -180 &&
    value[2] <= 180 &&
    value[1] >= -90 &&
    value[3] <= 90
  );
}

export function formatBbox(bbox: Bbox): string {
  return bbox.map((value) => value.toFixed(3)).join(", ");
}
