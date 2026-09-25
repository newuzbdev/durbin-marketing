import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lokal dev'ni Cloudflare quick tunnel orqali ochish (Meta App sozlamalari uchun ochiq URL)
  allowedDevOrigins: ["*.trycloudflare.com"],
};

export default nextConfig;
