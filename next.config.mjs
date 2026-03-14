/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // better-sqlite3 is a native module — keep it server-side only
    serverComponentsExternalPackages: ['better-sqlite3'],
  },
};

export default nextConfig;
