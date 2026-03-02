// @ts-check

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: process.env.NEXT_PUBLIC_MINIO_URL
          ? new URL(process.env.NEXT_PUBLIC_MINIO_URL).hostname
          : 'storage.koralink.sa',
      },
    ],
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          // Content-Security-Policy is set dynamically per-request in
          // src/middleware.ts using a cryptographic nonce to eliminate
          // 'unsafe-inline' for script-src. This static fallback is
          // intentionally omitted so the middleware nonce CSP always wins.
        ],
      },
    ];
  },
};

export default nextConfig;
