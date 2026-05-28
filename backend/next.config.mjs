/** @type {import('next').NextConfig} */
const nextConfig = {
  typedRoutes: true,
  serverExternalPackages: ['@solana/web3.js'],
  trailingSlash: false,
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
