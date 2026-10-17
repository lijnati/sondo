import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Both documented in node_modules/next/dist/docs (config/cacheComponents, config/partialPrefetching).
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
};

export default nextConfig;
