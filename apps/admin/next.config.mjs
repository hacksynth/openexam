/** @type {import('next').NextConfig} */
const nextConfig = {
  typedRoutes: true,
  transpilePackages: ["@openexam/core"],
  output: "standalone"
};

export default nextConfig;
