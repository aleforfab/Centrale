import { expect, it } from "vitest";
import { OBSERVATION_FALSE_COLOR } from "@/lib/falseColor";

it("uses a smooth palette across the normalized observation range", () => {
  const expression = OBSERVATION_FALSE_COLOR as unknown as (string | number | unknown[])[];
  expect(expression.slice(0, 3)).toEqual(["interpolate", ["linear"], ["raster-value"]]);
  const stops = expression.slice(3) as (number | string)[];
  const values = stops.filter((_, index) => index % 2 === 0) as number[];
  const colors = stops.filter((_, index) => index % 2 === 1) as string[];

  expect(values[0]).toBe(0);
  expect(values.at(-1)).toBe(1);
  expect(values).toHaveLength(9);
  expect(colors).toHaveLength(values.length);
  expect(values.every((value, index) => index === 0 || value > values[index - 1])).toBe(true);
});
