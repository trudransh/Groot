import type { NextConfig } from 'next'

const tunnelHost = process.env.WORLD_AUTH_REDIRECT_URI ? new URL(process.env.WORLD_AUTH_REDIRECT_URI).hostname : undefined

const nextConfig: NextConfig = {
  allowedDevOrigins: tunnelHost ? [tunnelHost] : [],
}

export default nextConfig
