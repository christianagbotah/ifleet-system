import * as React from 'react'
import { cn } from '@/lib/utils'

interface FormFieldWrapperProps {
  label?: string
  required?: boolean
  error?: string
  description?: string
  children: React.ReactNode
  className?: string
}

export function FormFieldWrapper({
  label,
  required,
  error,
  description,
  children,
  className,
}: FormFieldWrapperProps) {
  return (
    <div className={cn('space-y-2', className)}>
      {label && (
        <label className="text-sm font-medium leading-none">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
      {children}
      {error && (
        <p className="text-xs text-red-500" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
