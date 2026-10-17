import { MarketingHeader } from "@/components/marketing/marketing-header";
import { SiteFooter } from "@/components/shared/site-footer";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <MarketingHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
