import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // Type errors fail the build (strict). Set to true only if you must ship a WIP.
    ignoreBuildErrors: false,
  },
  // The client realtime hooks package ships dual ESM/CJS with "type": "module";
  // let Next transpile it so the webpack module graph loads correctly.
  transpilePackages: ["@trigger.dev/react-hooks"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
  // The project lives under ~/Desktop (often iCloud-synced), which makes
  // webpack's on-disk persistent cache time out on read. Use an in-memory
  // dev cache to avoid the noisy ETIMEDOUT "Restoring failed" warnings.
  webpack: (config, { dev }) => {
    if (dev) config.cache = { type: "memory" };
    return config;
  },
};

export default nextConfig;
