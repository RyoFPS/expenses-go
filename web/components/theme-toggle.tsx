"use client"

import { MoonIcon, SunIcon } from "@phosphor-icons/react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { resolvedTheme, setTheme } = useTheme()
  const dark = resolvedTheme === "dark"
  const label = dark ? "Mode terang" : "Mode gelap"
  return (
    <Button
      variant="ghost"
      size={compact ? "icon" : "default"}
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={label}
      className={compact ? undefined : "w-full justify-start"}
    >
      {/* Ikon dirender keduanya & disembunyikan via CSS agar tidak ada mismatch hidrasi. */}
      <SunIcon className="hidden size-5 dark:block" />
      <MoonIcon className="size-5 dark:hidden" />
      {!compact && <span className="text-muted-foreground">Ganti tema</span>}
    </Button>
  )
}
