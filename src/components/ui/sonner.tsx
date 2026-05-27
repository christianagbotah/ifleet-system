"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, ToasterProps } from "sonner"
import { CheckCircle2, XCircle, AlertTriangle, Info } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      position="top-right"
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast: [
            "group toast rounded-xl border shadow-lg",
            "backdrop-blur-sm bg-background/95",
            "data-[type=success]:border-emerald-200 dark:data-[type=success]:border-emerald-800",
            "data-[type=error]:border-red-200 dark:data-[type=error]:border-red-800",
            "data-[type=warning]:border-amber-200 dark:data-[type=warning]:border-amber-800",
            "data-[type=info]:border-blue-200 dark:data-[type=info]:border-blue-800",
          ].join(" "),
          title: "text-sm font-semibold",
          description: "text-xs text-muted-foreground",
          actionButton: "bg-primary text-primary-foreground text-xs font-medium rounded-lg px-3 py-1.5",
          cancelButton: "text-xs font-medium rounded-lg px-3 py-1.5",
          success: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-100",
          error: "bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-red-100",
          warning: "bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-100",
          info: "bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-100",
        },
      }}
      icons={{
        success: <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />,
        error: <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />,
        warning: <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />,
        info: <Info className="h-5 w-5 text-blue-600 dark:text-blue-400" />,
      }}
      {...props}
    />
  )
}

export { Toaster }
