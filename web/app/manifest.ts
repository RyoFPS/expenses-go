import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Dompet — Keuangan Pribadi",
    short_name: "Dompet",
    description: "Catatan keuangan pribadi dengan pencatatan otomatis dari notifikasi bank & e-wallet.",
    lang: "id",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [{ name: "Transaksi", url: "/transaksi" }],
  }
}
