import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "production.oknesset.org",
        pathname: "/**",
      },
      {
        // MK photos are sometimes served from a CDN
        protocol: "https",
        hostname: "*.oknesset.org",
        pathname: "/**",
      },
    ],
  },
  experimental: {
    typedRoutes: true,
  },
};

export default withNextIntl(nextConfig);
