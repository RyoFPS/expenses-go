import type { Metadata, Viewport } from "next"
import { Geist_Mono, Inter } from "next/font/google"

import "./globals.css"
import { AppShell } from "@/components/app-shell"
import { Providers } from "@/components/providers"
import { cn } from "@/lib/utils"

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })
// Mono hanya untuk pola aturan/kode: tidak perlu di-preload.
const fontMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono", preload: false })

export const metadata: Metadata = {
  title: { default: "Dompet", template: "%s · Dompet" },
  description: "Catatan keuangan pribadi: transaksi bank & e-wallet tercatat otomatis.",
  applicationName: "Dompet",
  appleWebApp: { capable: true, title: "Dompet", statusBarStyle: "default" },
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1b17" },
  ],
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" suppressHydrationWarning className={cn("antialiased", fontMono.variable, "font-sans", inter.variable)}>
      <head>
        <link rel="manifest" href="/manifest.webmanifest" crossOrigin="use-credentials" />
      </head>
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  )
}
