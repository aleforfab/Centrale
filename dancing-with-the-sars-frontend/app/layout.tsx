import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dancing with the SARs — exact NISAR backscatter, measured change",
  description: "Installed NISAR L-band GCOV products with exact dates, measured change statistics and full provenance.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
