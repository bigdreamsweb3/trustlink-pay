/** @type {import('next').NextConfig} */
const nextConfig = {
  trailingSlash: false,
  skipTrailingSlashRedirect: true,
  experimental: {
    serverComponentsExternalPackages: ['@solana/web3.js'],
  },
};

export default nextConfig;
