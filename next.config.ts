import type { NextConfig } from "next";

// Host
const HOST = process.env.HOST || '127.0.0.1';

// Read API port from environment variable (set by dev script) or default to 3001
const API_PORT = process.env.API_PORT || '3001';

const nextConfig: NextConfig = {
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/socket.io/',
          destination: `http://${HOST}:${API_PORT}/socket.io/`
        },
        {
          source: '/socket.io/:path*',
          destination: `http://${HOST}:${API_PORT}/socket.io/:path*`
        }
      ],
      afterFiles: [
        {
          source: '/api/admin/:path*',
          destination: `http://${HOST}:${API_PORT}/admin/:path*`
        },
        {
          source: '/api/:path*',
          destination: `http://${HOST}:${API_PORT}/api/:path*`
        }
      ]
    };
  }
};

export default nextConfig;
