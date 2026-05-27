"use client"

import * as React from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

interface FormStepIndicatorProps {
  steps: string[]
  currentStep: number
  className?: string
}

function FormStepIndicator({
  steps,
  currentStep,
  className,
}: FormStepIndicatorProps) {
  return (
    <div
      role="group"
      aria-label="Form progress"
      className={cn("w-full", className)}
    >
      <div className="flex items-center">
        {steps.map((step, index) => {
          const isCompleted = index < currentStep
          const isCurrent = index === currentStep
          const isUpcoming = index > currentStep
          const isLast = index === steps.length - 1

          return (
            <React.Fragment key={step}>
              {/* Step circle + label */}
              <div className="flex flex-col items-center gap-2">
                {/* Circle */}
                <motion.div
                  className={cn(
                    "relative z-10 flex size-8 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors",
                    isCompleted &&
                      "border-primary bg-primary text-primary-foreground",
                    isCurrent &&
                      "border-primary bg-background text-primary ring-2 ring-primary/30",
                    isUpcoming &&
                      "border-muted-foreground/30 bg-background text-muted-foreground"
                  )}
                  initial={false}
                  animate={
                    isCurrent
                      ? { scale: [1, 1.1, 1] }
                      : { scale: 1 }
                  }
                  transition={{ duration: 0.3 }}
                  aria-current={isCurrent ? "step" : undefined}
                >
                  {isCompleted ? (
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
                  ) : (
                    index + 1
                  )}
                </motion.div>

                {/* Label */}
                <span
                  className={cn(
                    "text-xs text-center max-w-[5rem] leading-tight",
                    isCurrent && "font-medium text-foreground",
                    isCompleted && "text-foreground",
                    isUpcoming && "text-muted-foreground"
                  )}
                >
                  {step}
                </span>
              </div>

              {/* Connector line */}
              {!isLast && (
                <div className="relative flex-1 mx-2 mt-[-1.5rem]">
                  <div
                    className={cn(
                      "absolute inset-y-0 left-0 right-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full",
                      index < currentStep
                        ? "bg-primary"
                        : "bg-muted-foreground/20"
                    )}
                  />
                  {/* Animated fill for transition feel */}
                  {index < currentStep && (
                    <motion.div
                      className="absolute inset-y-0 left-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-primary"
                      initial={{ width: "0%" }}
                      animate={{ width: "100%" }}
                      transition={{ duration: 0.3, delay: 0.1 }}
                    />
                  )}
                </div>
              )}
            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
}

export { FormStepIndicator, type FormStepIndicatorProps }
