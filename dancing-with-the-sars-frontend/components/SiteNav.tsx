import Link from "next/link";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/compare", label: "Before / after" },
  { href: "/time-machine", label: "Time Machine" },
];

export function SiteNav({ current }: { current?: string }) {
  return (
    <nav className="site-nav" aria-label="Sections">
      {LINKS.map((link, index) => (
        <Link
          key={link.href}
          href={link.href}
          aria-current={link.href === current ? "page" : undefined}
          className="site-nav__link"
        >
          <span className="site-nav__index" aria-hidden="true">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span>{link.label}</span>
        </Link>
      ))}
      <span className="site-nav__meta">NISAR · L-band · GCOV</span>
    </nav>
  );
}
