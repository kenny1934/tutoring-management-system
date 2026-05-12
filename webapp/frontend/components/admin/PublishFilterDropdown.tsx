"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type PublishedFilter = "published" | "unpublished" | null;

interface PublishFilterDropdownProps {
  publishedFilter: PublishedFilter;
  onChangePublished: (next: PublishedFilter) => void;
  /** Optional pair so the "Ready to publish" preset can set both filters at
   *  once (status=Paid + published=Unpublished). If omitted, the preset row
   *  is hidden — the dropdown becomes a plain publish filter. */
  statusFilter?: string | null;
  onChangeStatus?: (next: string | null) => void;
}

const STATUS_DOT: Record<NonNullable<PublishedFilter> | "all", string> = {
  all: "bg-gray-400 dark:bg-gray-500",
  published: "bg-green-500",
  unpublished: "bg-amber-500",
};

/** Compact single-button filter for an application's publish state.
 *  Replaces the older segmented control + preset chip combo so the filter
 *  row stays slim on mobile. Active state pushes the trigger's color into
 *  green (Published) or amber (Unpublished / Ready to publish). */
export function PublishFilterDropdown({
  publishedFilter,
  onChangePublished,
  statusFilter,
  onChangeStatus,
}: PublishFilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const presetSupported = !!onChangeStatus;
  const isReadyToPublish =
    presetSupported && statusFilter === "Paid" && publishedFilter === "unpublished";

  // Trigger label and accent reflect the most specific active state:
  // "Ready to publish" wins over the plain Published/Unpublished readout.
  let triggerLabel = "Publish";
  let accent: "neutral" | "green" | "amber" = "neutral";
  if (isReadyToPublish) {
    triggerLabel = "Ready to publish";
    accent = "amber";
  } else if (publishedFilter === "published") {
    triggerLabel = "Published";
    accent = "green";
  } else if (publishedFilter === "unpublished") {
    triggerLabel = "Unpublished";
    accent = "amber";
  }

  const apply = (next: PublishedFilter) => {
    onChangePublished(next);
    if (presetSupported && isReadyToPublish) {
      // Picking any plain option from the menu drops the Ready-to-publish
      // preset's status pin so the admin isn't stuck on Paid.
      onChangeStatus?.(null);
    }
    setOpen(false);
  };

  const applyReadyToPublish = () => {
    if (!presetSupported) return;
    if (isReadyToPublish) {
      onChangeStatus?.(null);
      onChangePublished(null);
    } else {
      onChangeStatus?.("Paid");
      onChangePublished("unpublished");
    }
    setOpen(false);
  };

  return (
    <div ref={wrapperRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Filter by publish status"
        className={cn(
          "inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-lg border transition-colors",
          accent === "green" &&
            "bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 border-green-300 dark:border-green-700",
          accent === "amber" &&
            "bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-700",
          accent === "neutral" &&
            "bg-white dark:bg-gray-800 text-foreground border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50",
          open && "ring-1 ring-primary/30",
        )}
      >
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-full",
            isReadyToPublish || publishedFilter === "unpublished"
              ? STATUS_DOT.unpublished
              : publishedFilter === "published"
                ? STATUS_DOT.published
                : STATUS_DOT.all,
          )}
        />
        <span>{triggerLabel}</span>
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-1 min-w-[180px] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1"
        >
          {([
            { value: null as PublishedFilter, label: "All", dot: STATUS_DOT.all },
            { value: "published" as const, label: "Published", dot: STATUS_DOT.published },
            { value: "unpublished" as const, label: "Unpublished", dot: STATUS_DOT.unpublished },
          ]).map((opt) => {
            const active = !isReadyToPublish && publishedFilter === opt.value;
            return (
              <button
                key={opt.label}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => apply(opt.value)}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-gray-50 dark:hover:bg-gray-800/60",
                  active && "bg-primary/5",
                )}
              >
                <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", opt.dot)} />
                <span className="flex-1 text-foreground">{opt.label}</span>
                {active && <Check className="h-3 w-3 text-primary" />}
              </button>
            );
          })}
          {presetSupported && (
            <>
              <div className="h-px bg-gray-200 dark:bg-gray-700 my-1" />
              <button
                type="button"
                role="menuitemradio"
                aria-checked={isReadyToPublish}
                onClick={applyReadyToPublish}
                className={cn(
                  "w-full flex items-start gap-2 px-3 py-1.5 text-xs text-left hover:bg-amber-50 dark:hover:bg-amber-900/15",
                  isReadyToPublish && "bg-amber-50/70 dark:bg-amber-900/20",
                )}
              >
                <span className={cn("w-1.5 h-1.5 rounded-full shrink-0 mt-1", STATUS_DOT.unpublished)} />
                <span className="flex-1">
                  <span className="block text-foreground font-medium">Ready to publish</span>
                  <span className="block text-[10px] text-muted-foreground">
                    Paid &amp; not yet published
                  </span>
                </span>
                {isReadyToPublish && <Check className="h-3 w-3 text-primary mt-1" />}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
