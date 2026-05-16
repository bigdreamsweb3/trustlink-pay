import type { NextConfig } from "next";
import { resolve } from "node:path";

const nextConfig: NextConfig = {
  typedRoutes: true,
  outputFileTracingRoot: resolve(__dirname),
  webpack: (config) => {
    config.resolve ??= {};
    config.resolve.alias = {
      ...config.resolve.alias,
      "framer-motion": resolve(__dirname, "node_modules/framer-motion"),
      "lucide-react": resolve(__dirname, "node_modules/lucide-react"),
    };
    config.resolve.modules = [
      resolve(__dirname, "node_modules"),
      ...(config.resolve.modules ?? []),
    ];

    return config;
  },
};

export default nextConfig;
//
