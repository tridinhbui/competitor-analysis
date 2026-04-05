import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs-dist is loaded from /public via /* webpackIgnore: true */
  // so it never goes through the bundler — no special config needed.

  // Turbopack (used by Vercel + Next.js 15+): stub out canvas for browser
  turbopack: {
    resolveAlias: {
      canvas: "./src/lib/emptyModule.ts",
    },
  },
};

export default nextConfig;
