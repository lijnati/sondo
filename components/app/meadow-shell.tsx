import { DM_Sans, Instrument_Serif } from "next/font/google";

import { MarketingMotion } from "@/components/marketing/motion";
import { SiteFooter } from "@/components/shared/site-footer";

import "@/app/(marketing)/marketing.css";
import "@/app/(brief)/brief.css";
import "@/app/(brief)/app.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-dm-sans",
  adjustFontFallback: true,
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: "italic",
  display: "swap",
  variable: "--font-instrument",
  adjustFontFallback: true,
});

/** Pixel-meadow page shell shared by the brief composer and the report pages. */
export function MeadowShell({ children }: { children: React.ReactNode }) {
  return (
    <div className={`marketing ${dmSans.variable} ${instrumentSerif.variable}`}>
      <MarketingMotion />
      <main id="main">{children}</main>
      <SiteFooter variant="marketing" />
    </div>
  );
}
