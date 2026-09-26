import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  serverExternalPackages: ["@solana/web3.js", "@sqds/multisig"],
};

export default nextConfig;
