import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: "https://rounds-ai-backend.onrender.com/api/v1/:path*",
      },
      {
        source: "/health",
        destination: "https://rounds-ai-backend.onrender.com/health",
      },
    ];
  },
};

export default nextConfig;
