import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface TooltipProps {
  content: string;
  children: ReactNode;
  align?: "center" | "right";
  className?: string;
}

export function Tooltip({ content, children, align = "center", className }: TooltipProps) {
  return (
    <span className="relative group inline-flex">
      {children}
      <span
        className={cn(
          "pointer-events-none absolute top-full mt-2",
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
