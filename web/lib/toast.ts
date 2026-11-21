// Pembungkus toast yang memuat `sonner` secara lazy agar tidak ikut bundle awal setiap halaman.
type Msg = Parameters<typeof import("sonner").toast.success>[0]

const load = () => import("sonner").then((m) => m.toast)

export const toast = {
  success: (m: Msg) => void load().then((t) => t.success(m)),
  error: (m: Msg) => void load().then((t) => t.error(m)),
  warning: (m: Msg) => void load().then((t) => t.warning(m)),
}
