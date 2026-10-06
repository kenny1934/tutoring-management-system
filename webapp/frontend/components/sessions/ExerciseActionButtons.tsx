"use client";

import { useState, useRef, useEffect, type ReactNode } from "react";
import { Search, FolderOpen, ExternalLink, Printer, Loader2, XCircle, Ellipsis } from "lucide-react";
import { Button } from "@/components/controls";
import { cn } from "@/lib/utils";

type FileActionState = { open?: 'loading' | 'error'; print?: 'loading' | 'error'; message?: string };

interface ExerciseActionButtonsProps {
  hasPdfName: boolean;
  canBrowseFiles: boolean;
  fileActionState?: FileActionState;
  onPaperlessSearch: () => void;
  onBrowseFile: () => void;
  onOpenFile: () => void;
  onPrintFile: () => void;
}

interface ActionItem {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}

export function ExerciseActionButtons({
  hasPdfName,
  canBrowseFiles,
  fileActionState,
  onPaperlessSearch,
  onBrowseFile,
  onOpenFile,
  onPrintFile,
}: ExerciseActionButtonsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [menuOpen]);

  // Build actions array (shared between mobile & desktop)
  const actions: ActionItem[] = [
    {
      label: "Search Shelv",
      icon: <Search className="h-4 w-4 text-amber-700 dark:text-amber-400" />,
      onClick: onPaperlessSearch,
    },
  ];

  if (canBrowseFiles) {
    actions.push({
      label: "Browse files",
      icon: <FolderOpen className="h-4 w-4 text-gray-500 dark:text-gray-400" />,
      onClick: onBrowseFile,
    });

    if (hasPdfName) {
      actions.push({
        label: fileActionState?.open === 'loading' && fileActionState?.message
          ? fileActionState.message : "Open PDF",
        icon: fileActionState?.open === 'loading'
          ? <Loader2 className="h-4 w-4 text-gray-500 animate-spin" />
          : fileActionState?.open === 'error'
          ? <XCircle className="h-4 w-4 text-red-600" />
          : <ExternalLink className="h-4 w-4 text-gray-500 dark:text-gray-400" />,
        onClick: onOpenFile,
        disabled: fileActionState?.open === 'loading',
      });
      actions.push({
        label: fileActionState?.print === 'loading' && fileActionState?.message
          ? fileActionState.message : "Print PDF",
        icon: fileActionState?.print === 'loading'
          ? <Loader2 className="h-4 w-4 text-gray-500 animate-spin" />
          : fileActionState?.print === 'error'
          ? <XCircle className="h-4 w-4 text-red-600" />
          : <Printer className="h-4 w-4 text-gray-500 dark:text-gray-400" />,
        onClick: onPrintFile,
        disabled: fileActionState?.print === 'loading',
      });
    }
  }

  return (
    <>
      {/* Desktop: inline icon buttons (md+) */}
      <div className="hidden md:contents">
        {actions.map((action, i) => {
          const showsMessage = action.disabled && action.label !== "Open PDF" && action.label !== "Print PDF";
          return (
            <Button
              key={i}
              onClick={action.onClick}
              disabled={action.disabled}
              className={cn("shrink-0", !showsMessage && "w-8 px-0")}
              title={action.label}
              aria-label={action.label}
            >
              {action.icon}
              {showsMessage && (
                <span className="text-[11px] text-amber-700 dark:text-amber-400 italic whitespace-nowrap max-w-[140px] truncate">
                  {action.label}
                </span>
              )}
            </Button>
          );
        })}
      </div>

      {/* Mobile: overflow menu (below md) */}
      <div ref={menuRef} className="relative md:hidden">
        <Button
          onClick={() => setMenuOpen(prev => !prev)}
          className="min-w-[44px] min-h-[44px] px-0 shrink-0"
          title="Actions"
          aria-label="Actions menu"
        >
          <Ellipsis className="h-4 w-4 text-ink-subtle" />
        </Button>
        {menuOpen && (
          <div className="absolute right-0 top-full mt-1 z-50 min-w-[160px] rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg py-1">
            {actions.map((action, i) => (
              <button
                key={i}
                type="button"
                onClick={() => { action.onClick(); setMenuOpen(false); }}
                disabled={action.disabled}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                {action.icon}
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
