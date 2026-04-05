import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Tell Next.js/webpack to transpile pdfjs-dist so it can handle the ESM build
  transpilePackages: ["pdfjs-dist"],

  webpack: (config, { isServer }) => {
    if (!isServer) {
      // pdfjs-dist canvas API not available in browser context via Next.js bundling
      config.resolve.alias = {
        ...config.resolve.alias,
        canvas: false,
      };
    }

    return config;
  },
};

export default nextConfig;
