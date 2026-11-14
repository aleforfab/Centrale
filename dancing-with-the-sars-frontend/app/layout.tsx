import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dancing with the SARs",
  description: "NISAR-ready radar surface change detection and backscatter analysis",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
