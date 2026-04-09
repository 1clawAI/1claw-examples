import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    serverExternalPackages: ["@waku/sdk", "@waku/utils", "protobufjs"],
};

export default nextConfig;
