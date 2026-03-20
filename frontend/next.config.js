/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    optimizePackageImports: ["@assistant-ui/react"],

  },
  typedRoutes: true,
  logging: {
    browserToTerminal: true,
    // 'error' — errors only (default)
    // 'warn'  — warnings and errors
    // true    — all console output
    // false   — disabled
  },
  async rewrites() {
    return [
      {
        source: "/assistant/:path*",
        destination: "http://localhost:3001/assistant/:path*",
      },
    ];
  },
};

export default nextConfig;
