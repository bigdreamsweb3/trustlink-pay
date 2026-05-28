import { resolve } from "path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  typedRoutes: true,
  transpilePackages: ["@trustlink/tsn-sdk", "trustlink-whatsapp-sdk"],
  outputFileTracingRoot: resolve(),
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
