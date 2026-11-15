import { redirect } from "next/navigation";

/** Old bookmarks lead directly to comparison within the unified workspace. */
export default function ComparePage() {
  redirect("/time-machine#compare");
}
