"use client"

import { CaretDownIcon, CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react"
import { format } from "date-fns"
import { id as idLocale } from "date-fns/locale"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { formatMonth } from "@/lib/format"

const months = Array.from({ length: 12 }, (_, month) => format(new Date(2024, month, 1), "MMM", { locale: idLocale }))

export function MonthPicker({ value, max, onChange }: { value: string; max: string; onChange: (value: string) => void }) {
  const [open, setOpen] = React.useState(false)
  const [year, setYear] = React.useState(Number(value.slice(0, 4)))

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setYear(Number(value.slice(0, 4)))
        setOpen(next)
      }}
    >
      <PopoverTrigger
        render={<Button type="button" variant="outline" aria-label="Pilih bulan" className="h-8 min-w-0 flex-1 justify-between font-normal sm:w-44 sm:flex-none" />}
      >
        <span className="truncate">{formatMonth(value)}</span>
        <CaretDownIcon className="size-4 shrink-0" />
      </PopoverTrigger>
      <PopoverContent align="center" className="w-72 gap-3 p-3">
        <div className="flex items-center justify-between">
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Tahun sebelumnya" onClick={() => setYear((y) => y - 1)}>
            <CaretLeftIcon />
          </Button>
          <span className="font-medium">{year}</span>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Tahun berikutnya" disabled={year >= Number(max.slice(0, 4))} onClick={() => setYear((y) => y + 1)}>
            <CaretRightIcon />
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {months.map((label, index) => {
            const month = `${year}-${String(index + 1).padStart(2, "0")}`
            return (
              <Button
                key={month}
                type="button"
                variant={month === value ? "default" : "ghost"}
                size="sm"
                disabled={month > max}
                onClick={() => {
                  onChange(month)
                  setOpen(false)
                }}
              >
                {label}
              </Button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
