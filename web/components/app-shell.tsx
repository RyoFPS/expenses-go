"use client"

import {
  ChartPieSliceIcon,
  CheckSquareOffsetIcon,
  DotsThreeCircleIcon,
  HouseIcon,
  ListBulletsIcon,
  PlusIcon,
  TagIcon,
  WalletIcon,
} from "@phosphor-icons/react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import * as React from "react"

import { useQuickAdd } from "@/components/quick-add"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { useNeedsReviewCount } from "@/lib/queries"
import { cn } from "@/lib/utils"

const NAV = [
  { href: "/", label: "Beranda", icon: HouseIcon },
  { href: "/transaksi", label: "Transaksi", icon: ListBulletsIcon },
  { href: "/review", label: "Review", icon: CheckSquareOffsetIcon },
  { href: "/akun", label: "Akun", icon: WalletIcon },
  { href: "/kategori", label: "Kategori", icon: TagIcon },
  { href: "/laporan", label: "Laporan", icon: ChartPieSliceIcon },
] as const

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`)
}

const noopSubscribe = () => () => {}
/** false saat SSR & render hidrasi pertama, true setelahnya — tanpa setState di effect. */
function useHydrated() {
  return React.useSyncExternalStore(noopSubscribe, () => true, () => false)
}

function ReviewBadge({ className }: { className?: string }) {
  // Cache query ini juga diisi data awal dari server oleh halaman Beranda. Badge baru ditampilkan
  // setelah hidrasi agar markup server & client identik (mencegah hydration mismatch / React #418).
  const hydrated = useHydrated()
  const { data: count } = useNeedsReviewCount()
  if (!hydrated || !count) return null
  return (
    <span
      className={cn(
        "money inline-flex min-w-5 items-center justify-center rounded-full bg-expense px-1.5 text-[11px] leading-5 font-semibold text-white",
        className
      )}
      aria-label={`${count} transaksi perlu review`}
    >
      {count > 99 ? "99+" : count}
    </span>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { open } = useQuickAdd()

  return (
    <div className="min-h-svh md:grid md:grid-cols-[15rem_1fr]">
      {/* Sidebar desktop */}
      <aside className="sticky top-0 hidden h-svh flex-col gap-1 border-r bg-sidebar p-4 md:flex">
        <Link href="/" className="mb-6 flex items-center gap-2 px-2 text-lg font-semibold tracking-tight">
          <span className="grid size-8 place-items-center rounded-xl bg-primary text-primary-foreground">
            <WalletIcon weight="bold" className="size-4" />
          </span>
          Dompet
        </Link>
        <Button size="lg" className="mb-4 w-full" onClick={open}>
          <PlusIcon weight="bold" data-icon="inline-start" />
          Catat tunai
        </Button>
        <nav aria-label="Navigasi utama" className="flex flex-col gap-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href)
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-2xl px-3 py-2 text-sm transition-colors",
                  active ? "bg-sidebar-accent font-medium text-foreground" : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
                )}
              >
                <Icon weight={active ? "fill" : "regular"} className="size-5" />
                <span className="flex-1">{label}</span>
                {href === "/review" && <ReviewBadge />}
              </Link>
            )
          })}
        </nav>
        <div className="mt-auto">
          <ThemeToggle />
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        {/* Header mobile */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-background px-4 py-2 md:hidden">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground">
              <WalletIcon weight="bold" className="size-4" />
            </span>
            Dompet
          </Link>
          <ThemeToggle compact />
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-4 pb-28 md:px-8 md:pt-8 md:pb-12">{children}</main>
      </div>

      {/* Navigasi bawah mobile */}
      <nav
        aria-label="Navigasi utama"
        className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t bg-background md:hidden"
      >
        <div className="mx-auto grid max-w-md grid-cols-5 items-end px-2">
          {NAV.slice(0, 2).map((item) => (
            <BottomLink key={item.href} {...item} active={isActive(pathname, item.href)} />
          ))}
          <div className="flex justify-center">
            <Button
              onClick={open}
              aria-label="Catat transaksi tunai"
              className="-mt-6 size-14 rounded-full shadow-lg [&_svg:not([class*='size-'])]:size-6"
            >
              <PlusIcon weight="bold" />
            </Button>
          </div>
          <BottomLink {...NAV[2]} active={isActive(pathname, NAV[2].href)} badge />
          <MoreMenu pathname={pathname} />
        </div>
      </nav>
    </div>
  )
}

function BottomLink({
  href,
  label,
  icon: Icon,
  active,
  badge,
}: (typeof NAV)[number] & { active: boolean; badge?: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex flex-col items-center gap-0.5 py-2 text-[11px]",
        active ? "font-medium text-foreground" : "text-muted-foreground"
      )}
    >
      <Icon weight={active ? "fill" : "regular"} className="size-6" />
      {label}
      {badge && <ReviewBadge className="absolute top-1 left-1/2 ml-1.5" />}
    </Link>
  )
}

/**
 * Menu "Lainnya" di navigasi bawah. Sengaja dibuat sebagai disclosure ringan (bukan DropdownMenu
 * + floating-ui ±50 KB) karena dimuat di setiap halaman mobile dan hanya berisi 3 tautan.
 */
function MoreMenu({ pathname }: { pathname: string }) {
  const more = NAV.slice(3)
  const active = more.some((n) => isActive(pathname, n.href))
  const [open, setOpen] = React.useState(false)
  const rootRef = React.useRef<HTMLDivElement>(null)
  const menuId = React.useId()

  React.useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    document.addEventListener("pointerdown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative flex justify-center">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex flex-col items-center gap-0.5 py-2 text-[11px] outline-none focus-visible:ring-3 focus-visible:ring-ring/30",
          active || open ? "font-medium text-foreground" : "text-muted-foreground"
        )}
      >
        <DotsThreeCircleIcon weight={active ? "fill" : "regular"} className="size-6" />
        Lainnya
      </button>
      {open && (
        <ul
          id={menuId}
          className="absolute right-0 bottom-full mb-2 min-w-44 rounded-2xl bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/10"
        >
          {more.map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <Link
                href={href}
                onClick={() => setOpen(false)}
                aria-current={isActive(pathname, href) ? "page" : undefined}
                className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
              >
                <Icon className="size-4" />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
