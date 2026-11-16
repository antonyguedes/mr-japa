import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    qualities: [75, 90],
  },
  // The browser only ever talks to this origin; the Go API stays private.
  rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.API_URL ?? "http://127.0.0.1:8080"}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
