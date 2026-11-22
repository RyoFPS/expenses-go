"use client"

import { DatePicker } from "@/components/date-picker"
import { TimePicker } from "@/components/time-picker"

export function DateTimePicker({
  id,
  value,
  onChange,
  invalid,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  invalid?: boolean
}) {
  return (
    <div className="grid min-w-0 grid-cols-[3fr_2fr] gap-2">
      <DatePicker
        id={id}
        value={value.slice(0, 10)}
        onChange={(date) => onChange(`${date}T${value.slice(11, 16) || "00:00"}`)}
        invalid={invalid}
      />
      <TimePicker value={value.slice(11, 16)} onChange={(time) => onChange(`${value.slice(0, 10)}T${time}`)} />
    </div>
  )
}
