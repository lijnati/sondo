import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Both documented in node_modules/next/dist/docs (config/cacheComponents, config/partialPrefetching).
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  // Dev assets are refused for any host other than localhost. 127.0.0.1 is the
  // usual one, and without this the meadow script never loads.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
