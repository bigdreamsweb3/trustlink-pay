import { resolve } from "path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["trustlink-whatsapp-sdk"],
  env: {
    NEXT_PUBLIC_TSN_RPC_GATEWAY_URL:
      process.env.TSN_RPC_GATEWAY_URL ?? "http://127.0.0.1:8787",
  },

  // 🚀 Move typed routes into the experimental block for Next.js 14
  experimental: {
    typedRoutes: true,
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
