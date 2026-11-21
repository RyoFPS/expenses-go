"use client"

import { Input } from "@/components/ui/input"

export function TimePicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <Input
      type="time"
      aria-label="Jam (WIB)"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-10 min-w-0 appearance-none bg-background [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
    />
  )
}
