import { toast as sonnerToast } from 'sonner'
import { CheckCircle2, XCircle, AlertTriangle, Info } from 'lucide-react'

const iconSize = 18

const styledToast = {
  success: (message: string, options?: Parameters<typeof sonnerToast.success>[1]) =>
    sonnerToast.success(message, {
      icon: <CheckCircle2 size={iconSize} className="text-emerald-500 dark:text-emerald-400" />,
      className: '!border-l-4 !border-l-emerald-500 dark:!border-l-emerald-400',
      ...options,
    }),

  error: (message: string, options?: Parameters<typeof sonnerToast.error>[1]) =>
    sonnerToast.error(message, {
      icon: <XCircle size={iconSize} className="text-red-500 dark:text-red-400" />,
      className: '!border-l-4 !border-l-red-500 dark:!border-l-red-400',
      ...options,
    }),

  warning: (message: string, options?: Parameters<typeof sonnerToast.warning>[1]) =>
    sonnerToast.warning(message, {
      icon: <AlertTriangle size={iconSize} className="text-amber-500 dark:text-amber-400" />,
      className: '!border-l-4 !border-l-amber-500 dark:!border-l-amber-400',
      ...options,
    }),

  info: (message: string, options?: Parameters<typeof sonnerToast.info>[1]) =>
    sonnerToast.info(message, {
      icon: <Info size={iconSize} className="text-blue-500 dark:text-blue-400" />,
      className: '!border-l-4 !border-l-blue-500 dark:!border-l-blue-400',
      ...options,
    }),
}

// Keep the raw sonner toast for advanced usage (e.g., custom toasts)
export { sonnerToast as rawToast }

export { styledToast as toast }

export default styledToast
