import { ProductNav } from "@/components/shared/product-nav";
import { SiteFooter } from "@/components/shared/site-footer";

export default function ProductLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ProductNav />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
