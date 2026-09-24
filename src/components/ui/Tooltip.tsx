"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

type TooltipProps = {
  trigger: React.ReactNode;
  children: React.ReactNode;
  /** Popover horizontal anchor relative to trigger. */
  align?: "left" | "right";
  className?: string;
  contentClassName?: string;
};

/**
 * Click-to-toggle popover. Tap trigger to open, tap backdrop to close.
 * Mobile-first (hover unreliable on touch). Anchored to the trigger element.
 */
export function Tooltip({
  trigger,
  children,
  align = "left",
  className,
  contentClassName,
}: TooltipProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className={cn("relative inline-block", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1"
        aria-expanded={open}
      >
        {trigger}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30 cursor-pointer" onClick={() => setOpen(false)} />
          <div
            className={cn(
              "absolute z-40 top-full mt-1.5 w-60 max-w-[calc(100vw-3rem)] bg-gray-900 text-white rounded-xl p-3 shadow-xl text-xs space-y-1.5",
              align === "right" ? "right-0" : "left-0",
              contentClassName,
            )}
          >
            {children}
          </div>
        </>
      )}
    </div>
  );
}
