import type { Metadata, Viewport } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "RoundsAI — Inpatient Oncology Ward Assistant",
  description: "Doctor Productivity & Clinical Knowledge Assistant for Inpatient Oncology Rounds",
  applicationName: "RoundsAI",
  keywords: ["oncology", "ward rounds", "CTCAE v5.0", "clinical copilot", "febrile neutropenia"],
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
