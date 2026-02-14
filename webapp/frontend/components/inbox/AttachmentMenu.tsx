"use client";

import React, { useState, useRef } from "react";
import { Paperclip, Image, FileText, Loader2 } from "lucide-react";
import { useClickOutside } from "@/lib/hooks";
import { cn } from "@/lib/utils";

interface AttachmentMenuProps {
  onFiles: (files: FileList) => void;
  disabled?: boolean;
  isUploading?: boolean;
  className?: string;
}

const ATTACHMENT_OPTIONS = [
  {
    id: "media",
    label: "Photos & Videos",
    icon: Image,
    accept: "image/*,video/*",
  },
  {
    id: "document",
    label: "Document",
    icon: FileText,
    accept: ".pdf,.doc,.docx,.xls,.xlsx,.txt",
  },
] as const;

export default function AttachmentMenu({ onFiles, disabled, isUploading, className }: AttachmentMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useClickOutside(menuRef, () => setIsOpen(false), isOpen);

  const handleOptionClick = (optionId: string) => {
    setIsOpen(false);
    fileInputRefs.current[optionId]?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFiles(e.target.files);
    }
    e.target.value = "";
  };

  return (
    <div ref={menuRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled || isUploading}
        className="p-1.5 text-gray-400 hover:text-[#a0704b] hover:bg-[#f5ede3]/60 dark:hover:bg-[#3d3628]/50 rounded transition-colors disabled:opacity-50"
        title="Attach file"
      >
        {isUploading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Paperclip className="h-4 w-4" />
        )}
      </button>

      {isOpen && (
        <div className="absolute bottom-full right-0 mb-1 z-20 bg-white dark:bg-[#2a2a2a] rounded-lg shadow-lg border border-[#e8d4b8] dark:border-[#6b5a4a] py-1 min-w-[180px]">
          {ATTACHMENT_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => handleOptionClick(option.id)}
              className="w-full px-3 py-2 text-sm text-left hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] flex items-center gap-2.5 text-gray-700 dark:text-gray-300 transition-colors"
            >
              <option.icon className="h-4 w-4 text-gray-400" />
              {option.label}
            </button>
          ))}
        </div>
      )}

      {/* Hidden file inputs — one per category for proper accept filtering */}
      {ATTACHMENT_OPTIONS.map((option) => (
        <input
          key={option.id}
          ref={(el) => { fileInputRefs.current[option.id] = el; }}
          type="file"
          accept={option.accept}
          multiple
          onChange={handleFileChange}
          className="hidden"
        />
      ))}
    </div>
  );
}
