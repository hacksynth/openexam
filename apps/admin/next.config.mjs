/** @type {import('next').NextConfig} */
const nextConfig = {
  typedRoutes: true,
  allowedDevOrigins: ["127.0.0.1"],
  transpilePackages: ["@openexam/core"],
  output: "standalone"
};

export default nextConfig;
