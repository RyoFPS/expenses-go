"use client"

import dynamic from "next/dynamic"

import { Drawer, DrawerContent } from "@/components/ui/drawer"
import { Skeleton } from "@/components/ui/skeleton"

const loadForm = () => import("@/components/quick-add-form")
export const prefetchForm = () => loadForm()

const QuickAddForm = dynamic(loadForm, {
  ssr: false,
  loading: () => (
    <div className="flex flex-col gap-4 p-5" aria-busy="true" aria-label="Memuat form">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  ),
})

export default function QuickAddDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} showSwipeHandle>
      <DrawerContent className="md:mx-auto md:max-w-lg">
        {open && <QuickAddForm onDone={() => onOpenChange(false)} />}
      </DrawerContent>
    </Drawer>
  )
}
