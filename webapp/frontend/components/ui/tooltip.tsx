import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  align?: "center" | "right";
  /** Which side of the trigger to open on. Use "top" inside overflow-hidden containers. */
  side?: "top" | "bottom";
  className?: string;
}

export function Tooltip({ content, children, align = "center", side = "bottom", className }: TooltipProps) {
  return (
    <span className="relative group inline-flex">
      {children}
      <span
        className={cn(
          "pointer-events-none absolute",
          side === "bottom" && "top-full mt-2",
          side === "top" && "bottom-full mb-2",
          align === "center" && "left-1/2 -translate-x-1/2",
          align === "right" && "right-0",
          "px-3 py-1.5 text-xs font-normal text-left leading-relaxed",
          "bg-[#3d3628] dark:bg-[#fef9f3] text-white dark:text-[#3d3628]",
          "rounded-md shadow-lg whitespace-normal w-max max-w-[220px]",
          "opacity-0 group-hover:opacity-100 transition-opacity duration-150",
          "z-[100]",
          className
        )}
      >
        {content}
      </span>
    </span>
  );
}
