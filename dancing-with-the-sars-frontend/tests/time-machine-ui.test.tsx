// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TimeReview } from "@/components/TimeReview";
import {
  DEFAULT_BBOX,
  DEFAULT_FEATURES,
  SCAN_DATES,
  SYNTHETIC_NOTICE,
  scanFrames,
  type ScanResult,
} from "@/lib/timeMachine";

const scan: ScanResult = {
  id: "ui-test-scan",
  title: "UI test scan",
  caveat: SYNTHETIC_NOTICE,
  notice: SYNTHETIC_NOTICE,
  bbox: DEFAULT_BBOX,
  features: DEFAULT_FEATURES,
  dateMode: "single",
  pol: "HH",
  beforeDate: SCAN_DATES[0],
  afterDate: SCAN_DATES[SCAN_DATES.length - 1],
  dates: [...SCAN_DATES],
  frames: scanFrames(DEFAULT_BBOX, "HH", DEFAULT_FEATURES),
  displayRange: [-25, -5],
  generatedAt: "2026-11-14T00:00:00.000Z",
};

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: () => ({
      matches: false,
      media: "",
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
});

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("TimeReview interactions", () => {
  it("supports a single event date slider, before/after label and playback toggle", () => {
    render(<TimeReview scan={scan} loading={false} />);

    const timeline = screen.getByLabelText("Observation date timeline");
    expect(timeline).toHaveProperty("value", "0");
    fireEvent.change(timeline, { target: { value: "3" } });
    expect(screen.getByText(SCAN_DATES[3])).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "After event" }));
    expect(screen.getByRole("button", { name: "After event" }).getAttribute("aria-pressed")).toBe("true");

    const play = screen.getByRole("button", { name: "Play evolution" });
    fireEvent.click(play);
    expect(screen.getByRole("button", { name: "Pause playback" })).toBeTruthy();
  });

  it("switches to two exact dates with a reveal slider", () => {
    render(<TimeReview scan={scan} loading={false} />);

    fireEvent.click(screen.getByRole("button", { name: "Two dates to compare" }));
    expect(screen.getByLabelText("Before date")).toBeTruthy();
    expect(screen.getByLabelText("After date")).toBeTruthy();
    expect(screen.getByText(/Resolved:/)).toBeTruthy();
    expect(screen.getAllByRole("slider", { name: "Reveal before and after frames" }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/difference\/change-mask layer/)).toBeTruthy();
  });

  it("keeps the synthetic notice and refuses a reversed pair", () => {
    render(<TimeReview scan={scan} loading={false} />);
    expect(screen.getByText(/not a real observation/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Two dates to compare" }));
    fireEvent.change(screen.getByLabelText("Before date"), {
      target: { value: SCAN_DATES[SCAN_DATES.length - 1] },
    });
    fireEvent.change(screen.getByLabelText("After date"), {
      target: { value: SCAN_DATES[0] },
    });
    expect(screen.getByText(/The before date must be earlier than the after date/)).toBeTruthy();
  });

  it("disables playback when the playback feature was not selected", () => {
    const withoutPlayback: ScanResult = {
      ...scan,
      features: scan.features.filter((item) => item !== "playback"),
    };
    render(<TimeReview scan={withoutPlayback} loading={false} />);
    expect((screen.getByRole("button", { name: "Play evolution" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Enable “Playback” in feature choices/)).toBeTruthy();
  });
});
