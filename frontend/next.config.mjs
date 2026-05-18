import { resolve } from 'path';

/** @type {import('next').NextConfig} */
const nextConfig = {
  typedRoutes: true,
  transpilePackages: ['trustlink-whatsapp-sdk'],
  outputFileTracingRoot: resolve(),
};
export default nextConfig;
