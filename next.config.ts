import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  devIndicators: false,
  // Externalize quickjs-emscripten packages to prevent webpack from mangling WASM loading
  serverExternalPackages: [
    'quickjs-emscripten',
    'quickjs-emscripten-core',
    '@jitl/quickjs-wasmfile-release-sync',
  ],
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    // We'll handle TypeScript errors separately
    ignoreBuildErrors: false,
  },
  webpack: (config, { isServer }) => {
    // Exclude server-only modules from client bundle
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        postgres: false,
        'better-sqlite3': false,
      };
      // Also exclude native Node.js modules
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      };
    }
    return config;
  },
  async rewrites() {
    return [
      // Handle published deployment URLs with standard web server behavior
      // /deployments/{projectId}/ -> index.html
      {
        source: '/deployments/:projectId',
        destination: '/deployments/:projectId/index.html',
      },
      {
        source: '/deployments/:projectId/',
        destination: '/deployments/:projectId/index.html',
      },
      // /deployments/{projectId}/page -> page.html (if no extension)
      {
        source: '/deployments/:projectId/:path([^.]+)',
        destination: '/deployments/:projectId/:path.html',
      },
    ];
  },
};

export default nextConfig;
