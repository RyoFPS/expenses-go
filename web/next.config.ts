import type { NextConfig } from "next"

// Alamat FastAPI yang dijangkau server Next.js (bukan browser). Di Docker: http://api:8000.
// Rewrites dievaluasi saat build, jadi untuk image Docker nilainya diberikan sebagai build arg.
const apiUrl = (process.env.API_INTERNAL_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "")

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async rewrites() {
    // Browser hanya bicara ke origin dashboard; /api/v1/* diteruskan ke FastAPI beserta header
    // Cloudflare Access (Cf-Access-Jwt-Assertion) yang ditambahkan Cloudflare di edge.
    return [{ source: "/api/v1/:path*", destination: `${apiUrl}/api/v1/:path*` }]
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ]
  },
}

export default nextConfig
