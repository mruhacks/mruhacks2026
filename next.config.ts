import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/login",
        destination: "/signin",
        permanent: false,
      },
    ];
  },
  cacheComponents: true,
};

export default nextConfig;
