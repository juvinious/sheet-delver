import type { NextConfig } from "next";

// Read API port from environment variable (set by dev script) or default to 3001
const API_PORT = process.env.API_PORT || '3001';

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `http://localhost:${API_PORT}/api/:path*`
      },
      {
        source: '/socket.io',
        destination: `http://localhost:${API_PORT}/socket.io/`
      }
    ];
  }
};

export default nextConfig;
