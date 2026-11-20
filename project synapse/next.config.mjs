/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  async headers() { return [{source:'/:path*', headers:[{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},{key:'Strict-Transport-Security',value:'max-age=63072000'}]}] },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Ensure public folder files are copied to build output
  output: 'standalone',
  // Copy public folder to standalone output
  async rewrites() {
    return [
      {
        source: '/micu.riv',
        destination: '/micu.riv',
      },
    ];
  },
}

export default nextConfig
