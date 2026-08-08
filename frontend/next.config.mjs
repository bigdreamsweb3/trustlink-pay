import { resolve } from "path";

const observabilityTracerPath = resolve("../utils/observability/dist/tracer.js");

/** @type {import('next').NextConfig} */
const useTurbopackDev = process.env.TRUSTLINK_TURBOPACK_DEV === "1";

const nextConfig = {
  transpilePackages: ["trustlink-whatsapp-sdk", "@trustlink/observability"],
  env: {
    NEXT_PUBLIC_TSN_RPC_GATEWAY_URL:
      process.env.TSN_RPC_GATEWAY_URL || "https://tsn-rpc-gateway.wasmer.app",
  },

  // 🚀 Move typed routes into the experimental block for Next.js 14
  experimental: {
    typedRoutes: !useTurbopackDev,
    outputFileTracingRoot: resolve(), // Nesting here resolves monorepo schema validation
  },

  // Keep-alive agent settings configuration
  httpAgentOptions: {
    keepAlive: true,
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
