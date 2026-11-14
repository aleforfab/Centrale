import Link from "next/link";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/compare", label: "Before / after" },
  { href: "/applications", label: "Applications" },
  { href: "/setup", label: "Real-case setup" },
  { href: "/time-machine", label: "Time Machine" },
];

export function SiteNav({ current }: { current?: string }) {
  return (
    <nav className="site-nav" aria-label="Sections">
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          aria-current={link.href === current ? "page" : undefined}
          className="site-nav__link"
        >
          {link.label}
        </Link>
      ))}
      <span className="site-nav__meta">NISAR · L-band · GCOV</span>
    </nav>
  );
}
