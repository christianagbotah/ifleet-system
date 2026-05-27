'use client'

import * as React from 'react'
import { format } from 'date-fns'
import { CalendarIcon } from 'lucide-react'
import { Calendar } from '@/components/ui/calendar'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

interface DatePickerProps {
  value?: string // ISO date string "YYYY-MM-DD" or empty
  onChange?: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  id?: string
  /** Max date selectable (ISO string or Date) */
  maxDate?: Date | string
  /** Min date selectable (ISO string or Date) */
  minDate?: Date | string
}

function parseDateString(value: string | undefined): Date | undefined {
  if (!value) return undefined
  const d = new Date(value)
  if (isNaN(d.getTime())) return undefined
  return d
}

function formatForDisplay(date: Date | undefined): string {
  if (!date) return ''
  return format(date, 'dd MMM yyyy')
}

export function DatePicker({
  value,
  onChange,
  placeholder = 'Select date',
  disabled = false,
  className,
  id,
  maxDate,
  minDate,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false)

  const selectedDate = parseDateString(value)
  const displayValue = formatForDisplay(selectedDate)

  const parsedMax = maxDate ? (typeof maxDate === 'string' ? parseDateString(maxDate) : maxDate) : undefined
  const parsedMin = minDate ? (typeof minDate === 'string' ? parseDateString(minDate) : minDate) : undefined

  function handleSelect(date: Date | undefined) {
    if (!date) {
      onChange?.('')
      setOpen(false)
      return
    }
    // Format to YYYY-MM-DD for consistent storage
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    onChange?.(`${year}-${month}-${day}`)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            'h-9 w-full justify-start text-left font-normal',
            !displayValue && 'text-muted-foreground',
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground shrink-0" />
          <span className={cn('truncate', !displayValue && 'text-muted-foreground')}>
            {displayValue || placeholder}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={handleSelect}
          disabled={(date) => {
            if (parsedMax && date > parsedMax) return true
            if (parsedMin && date < parsedMin) return true
            return false
          }}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  )
}
