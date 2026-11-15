import Link from "next/link";
import { AppShell } from "@/components/AppShell";

export default function NotFound() {
  return (
    <AppShell eyebrow="Not found" title="PAGE NOT IN THE CATALOGUE">
      <section className="plate" style={{ marginTop: "40px" }}>
        <div className="plate__header">
          <span className="plate__tag">404</span>
          <span className="plate__right-tag">unregistered route</span>
        </div>
        <div className="plate__body" style={{ textAlign: "center", padding: "48px 16px" }}>
          <p className="footnote" style={{ marginBottom: "24px" }}>The page you requested is not in the catalogue. It was never installed, or it has been removed.</p>
          <nav className="flex flex-wrap justify-center gap-4">
            <Link href="/" className="chapter-button">Dashboard</Link>
            <Link href="/compare" className="chapter-button">Before · After</Link>
            <Link href="/time-machine" className="chapter-button">Time Machine</Link>
          </nav>
        </div>
      </section>
    </AppShell>
  );
}
