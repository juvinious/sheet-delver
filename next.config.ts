import type { NextConfig } from "next";

// Read API port from environment variable (set by dev script) or default to 3001
const API_PORT = process.env.API_PORT || '3001';

console.log(`[Next.js] Configuring proxy to Core Service on port ${API_PORT}`);

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `http://localhost:${API_PORT}/api/:path*`
      },
      {
        source: '/socket.io/:path*',
        destination: `http://localhost:${API_PORT}/socket.io/:path*`
      }
    ];
  }
};

export default nextConfig;
