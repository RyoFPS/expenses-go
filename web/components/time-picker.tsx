"use client"

import { OptionSelect } from "@/components/option-select"

const hours = Array.from({ length: 24 }, (_, hour) => ({ value: String(hour).padStart(2, "0"), label: String(hour).padStart(2, "0") }))
const minutes = Array.from({ length: 60 }, (_, minute) => ({ value: String(minute).padStart(2, "0"), label: String(minute).padStart(2, "0") }))

export function TimePicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [hour = "00", minute = "00"] = value.split(":")

  return (
    <div className="flex min-w-0 items-center gap-1" role="group" aria-label="Jam (WIB)">
      <OptionSelect aria-label="Jam" value={hour} onChange={(next) => onChange(`${next}:${minute}`)} options={hours} className="h-10 w-16 px-2" />
      <span aria-hidden="true">:</span>
      <OptionSelect aria-label="Menit" value={minute} onChange={(next) => onChange(`${hour}:${next}`)} options={minutes} className="h-10 w-16 px-2" />
    </div>
  )
}
