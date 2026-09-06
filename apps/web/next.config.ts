import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@stancehub/shared", "@stancehub/db", "@stancehub/ai"],
};

export default nextConfig;
