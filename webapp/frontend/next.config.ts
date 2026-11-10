import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";
import { realpathSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";

// Worktrees share the primary checkout's node_modules. Turbopack's filesystem
// boundary must contain both directories so it can follow that symlink.
const dependencyDirectory = realpathSync(join(__dirname, "node_modules"));
let turbopackRoot = __dirname;
while (relative(turbopackRoot, dependencyDirectory).split(sep)[0] === "..") {
  turbopackRoot = dirname(turbopackRoot);
}

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  /* config options here */
  turbopack: { root: turbopackRoot },
  output: 'standalone', // Required for Docker deployment
  // Next's built-in trailing-slash strip runs BEFORE middleware, which
  // turned the games.* /<slug>/ URLs into a redirect loop (Next strips
  // the slash, the middleware re-adds it). This hands slash handling to
  // middleware.ts, which keeps the strip-redirect for every non-games
  // host and slash semantics for game folders. See middleware.test.ts.
  skipTrailingSlashRedirect: true,
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
  // BACKEND_REWRITE_URL also lets an isolated development preview use its own backend.
  // Production uses this as a fallback when not going through the Cloudflare Worker.
  async rewrites() {
    const backendUrl = (process.env.BACKEND_REWRITE_URL || 'http://localhost:8000') + '/api/:path*';
    return [
      {
        source: '/api/:path*',
        destination: backendUrl,
      },
    ];
  },
};

export default withBundleAnalyzer(nextConfig);
