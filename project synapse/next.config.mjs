import fs from 'node:fs'
import path from 'node:path'

function readRootSupabaseEnv() {
  const out = {}
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    out.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  }
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (key && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    out.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  }
  if (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    out.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  }
  try {
    const parentEnvPath = path.resolve(process.cwd(), '..', '.env.local')
    if (fs.existsSync(parentEnvPath)) {
      const lines = fs.readFileSync(parentEnvPath, 'utf8').split(/\r?\n/)
      for (const raw of lines) {
        const line = raw.trim()
        if (!line || line.startsWith('#')) continue
        const eq = line.indexOf('=')
        if (eq <= 0) continue
        const k = line.slice(0, eq).trim()
        const v = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
        if (
          (k === 'NEXT_PUBLIC_SUPABASE_URL' ||
            k === 'NEXT_PUBLIC_SUPABASE_ANON_KEY' ||
            k === 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') &&
          !out[k] &&
          v
        ) {
          out[k] = v
        }
      }
    }
  } catch {
    // Quiet fallback if parent .env.local is unreadable
  }
  return out
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  env: readRootSupabaseEnv(),
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
