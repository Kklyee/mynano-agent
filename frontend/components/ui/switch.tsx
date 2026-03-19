"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

type SwitchProps = Omit<React.ComponentProps<"button">, "onChange"> & {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
}

function Switch({
  checked = false,
  className,
  onCheckedChange,
  type,
  ...props
}: SwitchProps) {
  return (
    <button
      aria-checked={checked}
      className={cn(
        "inline-flex h-6 w-11 items-center rounded-full border border-input bg-muted px-0.5 transition-colors",
        checked && "bg-primary text-primary-foreground",
        className
      )}
      onClick={() => onCheckedChange?.(!checked)}
      role="switch"
      type={type ?? "button"}
      {...props}
    >
      <span
        className={cn(
          "block h-5 w-5 rounded-full bg-background shadow-sm transition-transform",
          checked && "translate-x-5"
        )}
      />
    </button>
  )
}

export { Switch }
