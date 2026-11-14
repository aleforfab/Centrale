import Link from "next/link";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/compare", label: "Before / after" },
  { href: "/applications", label: "Applications" },
  { href: "/setup", label: "Real-case setup" },
];

export function SiteNav({ current }: { current?: string }) {
  return (
    <nav className="mb-5 flex flex-wrap items-center gap-x-1 gap-y-2 text-xs" aria-label="Sections">
      {LINKS.map((link) => {
        const active = link.href === current;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`rounded border px-2.5 py-1 transition-colors ${
              active
                ? "border-sky-500/60 bg-sky-500/10 text-sky-200"
                : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500 hover:text-white"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
      <span className="ml-auto text-[10px] uppercase tracking-[0.18em] text-slate-500">
        NISAR · L-band · GCOV
      </span>
    </nav>
  );
}
