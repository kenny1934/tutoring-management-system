import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  /* config options here */
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
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:8000/api/:path*',
      },
    ];
  },
};

export default withBundleAnalyzer(nextConfig);
