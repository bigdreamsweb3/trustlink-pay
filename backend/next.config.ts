import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  serverExternalPackages: ['@solana/web3.js'],
  trailingSlash: false,
  skipTrailingSlashRedirect: true
};

export default nextConfig;
