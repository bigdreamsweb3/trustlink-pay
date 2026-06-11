import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const backendRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(backendRoot, "..");

/** @type {import('next').NextConfig} */
const nextConfig = {
  typedRoutes: true,
  transpilePackages: ["@trustlink/tsn-sdk"],
  serverExternalPackages: ["@solana/web3.js", "@solana/spl-token", "@coral-xyz/anchor"],
  outputFileTracingRoot: repoRoot,
  trailingSlash: false,
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
