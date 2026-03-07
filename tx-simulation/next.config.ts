import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
    // Pin trace root to this example so Next doesn't warn about monorepo lockfiles
    outputFileTracingRoot: path.join(process.cwd()),
};

export default nextConfig;
