import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  devIndicators: false,
  // Externalize quickjs-emscripten packages to prevent webpack from mangling WASM loading
  serverExternalPackages: [
    'quickjs-emscripten',
    'quickjs-emscripten-core',
    '@jitl/quickjs-wasmfile-release-sync',
    'esbuild-wasm',
    'handlebars',
  ],
  // Next 16 forwards browser console output to the dev terminal, defaulting to 'warn'. A project
  // under construction warns constantly, since the agent is mid-write and pages reference images
  // and files that do not exist yet, and that noise buries everything else.
  logging: {
    browserToTerminal: 'error',
  },

  // Next 16 writes AGENTS.md and CLAUDE.md into the project when `next dev` detects an AI agent,
  // and re-adds them after deletion. This repo keeps its agent instructions in the parent
  // directory, so an injected CLAUDE.md here would be loaded as a second, unowned source.
  agentRules: false,

  experimental: {
    // Next buffers every request body so it can be replayed into middleware, and truncates that
    // buffer at this size rather than rejecting the request: the route then receives a body cut
    // mid-string and `request.json()` throws what reads like data corruption. The default is 10MB.
    // Pushes are chunked well below this (lib/vfs/sync-manager.ts), so this is headroom rather
    // than the thing holding the sync together — the whole body is buffered in memory per request,
    // which is why it is not set higher.
    proxyClientMaxBodySize: '32mb',
  },

  typescript: {
    // We'll handle TypeScript errors separately
    ignoreBuildErrors: false,
  },
  webpack: (config, { isServer }) => {
    config.watchOptions = {
      ...config.watchOptions,
      ignored: ['**/e2e/**', '**/test-results/**', '**/node_modules/**'],
    };
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
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
  async headers() {
    return [
      {
        source: '/deployments/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=3600' },
        ],
      },
    ];
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
