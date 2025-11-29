import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  devIndicators: false,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    // We'll handle TypeScript errors separately
    ignoreBuildErrors: false,
  },
  webpack: (config, { isServer }) => {
    // Exclude postgres from client bundle (server-only)
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        postgres: false,
      };
    }
    return config;
  },
  async rewrites() {
    return [
      // Handle published site URLs with standard web server behavior
      // /sites/{projectId}/ -> index.html
      {
        source: '/sites/:projectId',
        destination: '/sites/:projectId/index.html',
      },
      {
        source: '/sites/:projectId/',
        destination: '/sites/:projectId/index.html',
      },
      // /sites/{projectId}/page -> page.html (if no extension)
      {
        source: '/sites/:projectId/:path([^.]+)',
        destination: '/sites/:projectId/:path.html',
      },
    ];
  },
};

export default nextConfig;
