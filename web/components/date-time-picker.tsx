"use client"

import { CalendarBlankIcon } from "@phosphor-icons/react"
import { format } from "date-fns"
import { id as idLocale } from "date-fns/locale"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { jakartaDate } from "@/lib/format"

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
  const [open, setOpen] = React.useState(false)
  const [year, month, day] = value.slice(0, 10).split("-").map(Number)
  const selected = year && month && day ? new Date(year, month - 1, day) : undefined
  const [todayYear, todayMonth, todayDay] = jakartaDate().split("-").map(Number)

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              id={id}
              type="button"
              variant="outline"
              aria-invalid={invalid}
              className="h-10 w-full min-w-0 justify-start truncate font-normal"
            />
          }
        >
          <CalendarBlankIcon className="size-4 shrink-0" />
          {selected ? format(selected, "d MMM yyyy", { locale: idLocale }) : "Pilih tanggal"}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto max-w-[calc(100vw-2rem)] overflow-hidden p-0">
          <Calendar
            mode="single"
            locale={idLocale}
            today={new Date(todayYear, todayMonth - 1, todayDay)}
            selected={selected}
            defaultMonth={selected}
            onSelect={(date) => {
              if (!date) return
              onChange(`${format(date, "yyyy-MM-dd")}T${value.slice(11, 16) || "00:00"}`)
              setOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>
      <Input
        id={`${id}-clock`}
        type="time"
        aria-label="Jam (WIB)"
        aria-invalid={invalid}
        className="h-10 px-2"
        value={value.slice(11, 16)}
        onChange={(event) => onChange(`${value.slice(0, 10)}T${event.target.value}`)}
      />
    </div>
  )
}
