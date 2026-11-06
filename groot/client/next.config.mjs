/** @type {import('next').NextConfig} */
// Sites allowed to embed the app in an iframe (space-separated origins).
const embedOrigins = process.env.EMBED_ALLOWED_ORIGINS ?? '';

const nextConfig = {
  // Separate build dir per instance so two dev servers can run side by side.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [{ key: 'Content-Security-Policy', value: `frame-ancestors 'self' ${embedOrigins}` }],
      },
    ];
  },
};

export default nextConfig;
