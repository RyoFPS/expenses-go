"use client"

import { CalendarBlankIcon } from "@phosphor-icons/react"
import { format } from "date-fns"
import { id as idLocale } from "date-fns/locale"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { jakartaDate } from "@/lib/format"

export function DatePicker({
  id,
  value,
  onChange,
  clearable = false,
  invalid,
  className,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  clearable?: boolean
  invalid?: boolean
  className?: string
}) {
  const [open, setOpen] = React.useState(false)
  const [year, month, day] = value.split("-").map(Number)
  const selected = year && month && day ? new Date(year, month - 1, day) : undefined
  const [todayYear, todayMonth, todayDay] = jakartaDate().split("-").map(Number)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            aria-invalid={invalid}
            className={cn("h-10 w-full min-w-0 justify-start font-normal", className)}
          />
        }
      >
        <CalendarBlankIcon className="size-4 shrink-0" />
        <span className="min-w-0 truncate">
          {selected ? format(selected, "d MMM yyyy", { locale: idLocale }) : "Pilih tanggal"}
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto max-w-[calc(100vw-2rem)] gap-0 overflow-hidden p-0">
        <Calendar
          mode="single"
          locale={idLocale}
          today={new Date(todayYear, todayMonth - 1, todayDay)}
          selected={selected}
          defaultMonth={selected}
          onSelect={(date) => {
            if (!date) return
            onChange(format(date, "yyyy-MM-dd"))
            setOpen(false)
          }}
        />
        {clearable && value && (
          <Button
            type="button"
            variant="ghost"
            className="m-2 mt-0"
            onClick={() => {
              onChange("")
              setOpen(false)
            }}
          >
            Hapus tanggal
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}
