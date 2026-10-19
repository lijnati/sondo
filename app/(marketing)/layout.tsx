import { DM_Sans, Instrument_Serif } from "next/font/google";

import { MarketingMotion } from "@/components/marketing/motion";
import { SiteFooter } from "@/components/shared/site-footer";

import "./marketing.css";

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

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`marketing ${dmSans.variable} ${instrumentSerif.variable}`}>
      <MarketingMotion />
      <main id="main">{children}</main>
      <SiteFooter variant="marketing" />
    </div>
  );
}
