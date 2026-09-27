import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev only: lets a phone on the same Wi-Fi open the dev server (http://192.168.x.x:3000).
  allowedDevOrigins: ["192.168.*.*"],
};

export default nextConfig;
