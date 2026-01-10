"use client";

import React, { useState, useEffect, useRef } from "react";
import { Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface CopyPathButtonProps {
  paths: string;
  filename: string;
}

export function CopyPathButton({ paths, filename }: CopyPathButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const pathList = paths ? paths.split(", ").filter(Boolean) : [];

  const handleCopy = (path: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    navigator.clipboard.writeText(path);
    setCopied(path);
    setTimeout(() => {
      setCopied(null);
      setIsOpen(false);
    }, 1500);
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (pathList.length <= 1) {
      // Single path - copy directly
      handleCopy(pathList[0] || filename, e);
    } else {
      // Multiple paths - toggle dropdown
      setIsOpen(!isOpen);
      setFocusedIndex(0);
    }
  };

  // Keyboard navigation for dropdown
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || pathList.length <= 1) return;
    switch (e.key) {
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        break;
      case "ArrowDown":
        e.preventDefault();
        setFocusedIndex((i) => Math.min(i + 1, pathList.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setFocusedIndex((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        handleCopy(pathList[focusedIndex]);
        break;
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const showCheckmark = pathList.length <= 1 && copied;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        className="p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-[#a0704b]/50"
        title={pathList.length > 1 ? "Select path to copy" : "Copy path"}
        aria-haspopup={pathList.length > 1 ? "listbox" : undefined}
        aria-expanded={pathList.length > 1 ? isOpen : undefined}
      >
        {showCheckmark ? (
          <Check className="h-4 w-4 text-green-600" />
        ) : (
          <Copy className="h-4 w-4 text-gray-500" />
        )}
      </button>

      {isOpen && pathList.length > 1 && (
        <div
          className={cn(
            "absolute right-0 top-full mt-1 z-50",
            "bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a]",
            "rounded-lg shadow-lg min-w-[300px] max-w-[90vw] sm:max-w-[600px] overflow-hidden"
          )}
          onClick={(e) => e.stopPropagation()}
          role="listbox"
        >
          <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800/50 border-b border-[#e8d4b8]/50 dark:border-[#6b5a4a]/50">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
              Select path to copy (↑↓ to navigate, Enter to copy)
            </p>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {pathList.map((path, i) => (
              <button
                key={i}
                onClick={(e) => handleCopy(path, e)}
                className={cn(
                  "w-full text-left px-3 py-2 text-xs",
                  "hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] transition-colors",
                  "flex items-center gap-2 border-b border-[#e8d4b8]/20 dark:border-[#6b5a4a]/20 last:border-0",
                  "focus:outline-none focus:bg-[#f5ede3] dark:focus:bg-[#2d2618]",
                  i === focusedIndex && "bg-[#f5ede3] dark:bg-[#2d2618]"
                )}
                role="option"
                aria-selected={i === focusedIndex}
              >
                {copied === path ? (
                  <Check className="h-3 w-3 text-green-600 flex-shrink-0" />
                ) : (
                  <Copy className="h-3 w-3 text-gray-500 flex-shrink-0" />
                )}
                <span className="break-all text-gray-700 dark:text-gray-300" title={path}>{path}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
