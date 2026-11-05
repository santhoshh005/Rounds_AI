import type { Metadata, Viewport } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "RoundsAI — Inpatient Oncology Ward Copilot",
  description: "AI-assisted clinical decision support, bedside rounds capture, and CTCAE v5.0 grading for medical oncology.",
  applicationName: "RoundsAI",
  keywords: ["oncology", "ward rounds", "CTCAE v5.0", "clinical copilot", "febrile neutropenia"],
  metadataBase: new URL("https://rounds-ai-umber.vercel.app"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "RoundsAI — Inpatient Oncology Ward Copilot",
    description: "Deterministic CTCAE v5.0 myelosuppression grading, bedside rounds capture, and clinician-attested SOAP documentation.",
    url: "https://rounds-ai-umber.vercel.app",
    siteName: "RoundsAI",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "RoundsAI — Inpatient Oncology Ward Copilot",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "RoundsAI — Inpatient Oncology Ward Copilot",
    description: "Deterministic CTCAE v5.0 myelosuppression grading, bedside rounds capture, and clinician-attested SOAP documentation.",
    images: ["/og-image.png"],
  },
  // The tab icon comes from app/icon.svg (served by Next.js automatically).
};

export const viewport: Viewport = {
  themeColor: "#0b1118",
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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@1&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
