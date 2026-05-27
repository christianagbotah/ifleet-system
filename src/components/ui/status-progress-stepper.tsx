"use client"

import * as React from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

interface StatusProgressStep {
  label: string
  status: "completed" | "current" | "upcoming"
  date?: string
}

interface StatusProgressStepperProps {
  steps: StatusProgressStep[]
  className?: string
}

const statusCircleClasses: Record<StatusProgressStep["status"], string> = {
  completed:
    "border-emerald-500 bg-emerald-500 text-white",
  current:
    "border-amber-500 bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400",
  upcoming:
    "border-muted-foreground/30 bg-background text-muted-foreground",
}

const statusLineClasses: Record<StatusProgressStep["status"], string> = {
  completed: "bg-emerald-500",
  current: "bg-muted-foreground/20",
  upcoming: "bg-muted-foreground/20",
}

function StatusProgressStepper({
  steps,
  className,
}: StatusProgressStepperProps) {
  return (
    <div
      role="list"
      aria-label="Progress steps"
      className={cn("flex flex-col", className)}
    >
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1

        return (
          <div
            key={step.label}
            role="listitem"
            className="relative flex gap-4"
          >
            {/* Vertical line + circle column */}
            <div className="flex flex-col items-center">
              {/* Circle */}
              <motion.div
                className={cn(
                  "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold",
                  statusCircleClasses[step.status]
                )}
                initial={false}
                animate={
                  step.status === "current"
                    ? { scale: [1, 1.08, 1] }
                    : { scale: 1 }
                }
                transition={{
                  duration: 2,
                  repeat: step.status === "current" ? Infinity : 0,
                  ease: "easeInOut",
                }}
              >
                {step.status === "completed" ? (
                  <svg
                    className="size-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={3}
                    aria-hidden
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                ) : step.status === "current" ? (
                  <span className="flex size-2.5 rounded-full bg-amber-500" />
                ) : (
                  <span className="text-muted-foreground/50">{index + 1}</span>
                )}
              </motion.div>

              {/* Connecting line */}
              {!isLast && (
                <div
                  className={cn(
                    "w-0.5 flex-1 min-h-8",
                    statusLineClasses[step.status]
                  )}
                />
              )}
            </div>

            {/* Content column */}
            <div className={cn("pb-8", isLast && "pb-0")}>
              <p
                className={cn(
                  "text-sm font-medium leading-tight",
                  step.status === "completed" && "text-foreground",
                  step.status === "current" &&
                    "text-foreground",
                  step.status === "upcoming" && "text-muted-foreground"
                )}
              >
                {step.label}
              </p>
              {step.date && (
                <p
                  className={cn(
                    "mt-1 text-xs",
                    step.status === "upcoming"
                      ? "text-muted-foreground/60"
                      : "text-muted-foreground"
                  )}
                >
                  {step.date}
                </p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export { StatusProgressStepper, type StatusProgressStepperProps }
