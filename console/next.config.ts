import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
      {
        protocol: "https",
        hostname: "*.boatsetter.com",
      },
      {
        protocol: "https",
        hostname: "images.boatsetter.com",
      },
      {
        protocol: "https",
        hostname: "*.mvpmiami.com",
      },
      {
        protocol: "https",
        hostname: "mvpmiami.com",
      },
      {
        protocol: "https",
        hostname: "*.airbnb.com",
      },
      {
        protocol: "https",
        hostname: "a0.muscache.com",
      },
    ],
  },
};

export default nextConfig;
