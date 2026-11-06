/** @type {import('next').NextConfig} */
// Sites allowed to embed the app in an iframe (space-separated origins).
const embedOrigins = process.env.EMBED_ALLOWED_ORIGINS ?? '';

const nextConfig = {
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
