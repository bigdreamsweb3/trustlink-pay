import type { NextConfig } from "next";
import { resolve } from "node:path";

const nextConfig: NextConfig = {
  typedRoutes: true,
  outputFileTracingRoot: resolve(__dirname),
};

export default nextConfig;
