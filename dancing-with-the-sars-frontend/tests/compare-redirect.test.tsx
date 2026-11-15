import { expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
import { redirect } from "next/navigation";
import ComparePage from "@/app/compare/page";
it("sends old comparison bookmarks to the unified comparison view", () => {
  ComparePage();
  expect(redirect).toHaveBeenCalledWith("/time-machine#compare");
});
