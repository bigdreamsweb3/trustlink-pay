import type { NextConfig } from "next";
import { resolve } from "node:path";

const backendUrl =
  process.env.BACKEND_URL ?? "https://trustlink-pay-backend.vercel.app/";

const nextConfig: NextConfig = {
  typedRoutes: true,
  outputFileTracingRoot: resolve(__dirname),
  async rewrites() {
    return [
      {
        source: "/backend/:path*",
        destination: `${backendUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
