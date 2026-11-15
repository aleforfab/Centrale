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

export function AppShell({
  current,
  eyebrow = "The SAR Field Catalogue",
  title,
  subtitle,
  status,
  children,
}: AppShellProps) {
  return (
    <div className="app-shell">
      <div className="app-shell__inner">
        <header className="masthead">
          <div className="app-shell__top">
            <Link href="/" className="app-shell__brand" aria-label="Dancing with the SARs home">
              <span className="app-shell__mark" aria-hidden="true">
                <svg viewBox="0 0 32 32" width="24" height="24">
                  <circle cx="16" cy="16" r="5" fill="currentColor" />
                  <ellipse
                    cx="16"
                    cy="16"
                    rx="13"
                    ry="6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    transform="rotate(-24 16 16)"
                  />
                  <circle cx="27" cy="10" r="2.2" fill="currentColor" opacity="0.4" />
                </svg>
              </span>
              <span>
                <span className="app-shell__eyebrow">{eyebrow}</span>
                <span className="app-shell__title">{title}</span>
                {subtitle && <span className="app-shell__subtitle">{subtitle}</span>}
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
          <div className="redesign-content">{children}</div>
        </div>
      </div>
    </div>
  );
}
