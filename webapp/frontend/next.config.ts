import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  /* config options here */
  output: 'standalone', // Required for Docker deployment
  eslint: {
    // Allow production builds with ESLint warnings (errors will still fail)
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Allow production builds with TypeScript errors
    ignoreBuildErrors: true,
  },
  allowedDevOrigins: [
        "100.91.219.25",
        "kenny-chiu-priv",
        "127.0.0.1",
      ],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.googleusercontent.com',
        pathname: '/**',
      },
    ],
  },
  // Rewrite /api/* to the backend
  // - Development: proxy to localhost backend
  // - Production: proxy to Cloud Run backend (fallback when not going through Cloudflare Worker)
  async rewrites() {
    const backendUrl = process.env.NODE_ENV === 'production'
      ? 'https://tutoring-backend-284725664511.asia-east2.run.app/api/:path*'
      : 'http://localhost:8000/api/:path*';
    return [
      {
        source: '/api/:path*',
        destination: backendUrl,
      },
    ];
  },
};

export default withBundleAnalyzer(nextConfig);
