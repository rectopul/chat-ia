import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    /* config options here */
    allowedDevOrigins: [
        "local-origin.dev",
        "*.local-origin.dev",
        "migration-springer-klein-perl.trycloudflare.com",
    ],
    output: "standalone",
};

export default nextConfig;
