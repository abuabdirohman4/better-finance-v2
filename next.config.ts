import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:5102"],
    },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
    ],
  },
  async redirects() {
    return [
      { source: "/assets", destination: "/net-worth", permanent: true },
      { source: "/assets/:path*", destination: "/net-worth/:path*", permanent: true },
    ];
  },
};

export default withNextIntl(nextConfig);
