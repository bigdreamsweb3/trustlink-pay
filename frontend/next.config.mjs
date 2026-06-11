import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const frontendRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(frontendRoot, "..");

/** @type {import('next').NextConfig} */
const nextConfig = {
  typedRoutes: true,
  transpilePackages: [
    "trustlink-whatsapp-sdk",
    "@trustlink/tsn-sdk",
    "@solana/spl-token",
  ],
  outputFileTracingRoot: repoRoot,
  webpack(config, { isServer }) {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        dns: false,
        child_process: false,
      };
    }
    return config;
  },
  async rewrites() {
    const backendUrl =
      process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3000";
    return {
      beforeFiles: [
        {
          source: "/backend/:path*",
          destination: `${backendUrl}/api/:path*`,
        },
      ],
    };
  },
};
export default nextConfig;
