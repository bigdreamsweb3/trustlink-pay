import { resolve } from "path";

const observabilityTracerPath = resolve("../utils/observability/dist/tracer.js");

/** @type {import('next').NextConfig} */
const useTurbopackDev = process.env.TRUSTLINK_TURBOPACK_DEV === "1";
const defaultRpcGatewayUrl = "https://tsn-rpc-gateway.vercel.app";

function normalizeRpcGatewayUrl(value) {
  if (!value) return defaultRpcGatewayUrl;
  try {
    const parsed = new URL(value);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      (parsed.pathname !== "" && parsed.pathname !== "/" && parsed.pathname !== "/rpc")
    ) {
      return defaultRpcGatewayUrl;
    }
    parsed.pathname = parsed.pathname === "/rpc" ? "/rpc" : "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return defaultRpcGatewayUrl;
  }
}

// Prefer the browser-facing variable. A stale TSN_RPC_GATEWAY_URL must not
// override it with a page URL during a Vercel build.
const publicRpcGatewayUrl = normalizeRpcGatewayUrl(
  process.env.NEXT_PUBLIC_TSN_RPC_GATEWAY_URL ||
  process.env.TSN_RPC_GATEWAY_URL ||
  defaultRpcGatewayUrl,
);

const nextConfig = {
  transpilePackages: ["trustlink-whatsapp-sdk", "@trustlink/observability"],
  env: {
    NEXT_PUBLIC_TSN_RPC_GATEWAY_URL: publicRpcGatewayUrl,
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
      process.env.NEXT_PUBLIC_BACKEND_URL || "https://trustlink-pay-backend.vercel.app";
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
