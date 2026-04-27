"use client";

import { Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCopyToClipboard } from "@/lib/hooks/useCopyToClipboard";

interface CopyDataButtonProps {
  /** Called on click so the TSV is built from the latest data, not memoized stale. */
  build: () => string;
  title?: string;
}

export function CopyDataButton({ build, title = "Copy as TSV" }: CopyDataButtonProps) {
  const { copied, copy } = useCopyToClipboard(1500);

  return (
    <button
      onClick={() => copy(build())}
      title={copied ? "Copied!" : title}
      aria-label={title}
      className={cn(
        "p-1 rounded border transition-colors",
        copied
          ? "bg-green-600 text-white border-green-600"
          : "bg-[#f5ede3] dark:bg-[#3d3628] text-gray-500 dark:text-gray-400 border-[#e8d4b8] dark:border-[#6b5a4a] hover:text-gray-700 dark:hover:text-gray-300"
      )}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}
