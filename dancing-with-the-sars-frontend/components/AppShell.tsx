import type { ReactNode } from "react";
import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import "@/app/redesign.css";

interface AppShellProps {
  current?: string;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  status?: ReactNode;
  children: ReactNode;
}

const BRAND_WORDMARK = "Dancing with the SARs";

export function AppShell({
  current,
  eyebrow = "The SAR Field Catalogue",
  title,
  subtitle,
  status,
  children,
}: AppShellProps) {
  const showDistinctTitle = Boolean(title && title !== BRAND_WORDMARK);

  return (
    <div className="app-shell">
      <div className="app-shell__inner">
        <header className="masthead">
          <div className="app-shell__top">
            <Link href="/" className="app-shell__brand" aria-label="Dancing with the SARs home">
              <span className="app-shell__mark" aria-hidden="true">
                <svg viewBox="0 0 32 32" width="24" height="24">
                  <circle cx="16" cy="16" r="4.5" fill="currentColor" />
                  <ellipse
                    cx="16"
                    cy="16"
                    rx="12.5"
                    ry="5.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    transform="rotate(-24 16 16)"
                  />
                  <circle cx="26.5" cy="10.5" r="2.3" fill="var(--accent-graphic)" />
                </svg>
              </span>
              <span className="masthead__brand-copy">
                <span className="app-shell__eyebrow">{eyebrow}</span>
                <span className="masthead__wordmark">{BRAND_WORDMARK}</span>
              </span>
            </Link>
            {status && (
              <div className="app-shell__status" role="status">
                {status}
              </div>
            )}
          </div>
          <SiteNav current={current} />
        </header>

        <div className="app-shell__content">
          {(showDistinctTitle || subtitle) ? (
            <div className="app-shell__header">
              <h1 className={showDistinctTitle ? "app-shell__title" : "sr-only"}>{title}</h1>
              {subtitle && <p className="app-shell__subtitle">{subtitle}</p>}
            </div>
          ) : (
            <h1 className="sr-only">{title}</h1>
          )}
          <div className="redesign-content">{children}</div>
        </div>
      </div>
    </div>
  );
}
