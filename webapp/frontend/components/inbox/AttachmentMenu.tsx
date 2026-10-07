"use client";

import React, { useState, useRef } from "react";
import { Paperclip, Image, FileText, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconButton } from "@/components/controls";
import FloatingDropdown from "@/components/inbox/FloatingDropdown";

interface AttachmentMenuProps {
  onFiles: (files: FileList) => void;
  disabled?: boolean;
  isUploading?: boolean;
  className?: string;
}

const ATTACHMENT_OPTIONS = [
  {
    id: "media",
    label: "Photos & videos",
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

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
    <div className={cn(className)}>
      <IconButton
        ref={triggerRef}
        size="sm"
        icon={isUploading ? Loader2 : Paperclip}
        iconClassName={isUploading ? "animate-spin" : undefined}
        label="Attach file"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled || isUploading}
        aria-expanded={isOpen}
      />

      <FloatingDropdown
        triggerRef={triggerRef}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        align="right"
        className="bg-raised-2 dark:bg-raised-2 rounded-lg shadow-lg border border-line dark:border-line py-1 min-w-[180px]"
      >
        {ATTACHMENT_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => handleOptionClick(option.id)}
            className="w-full px-3 py-2 text-sm text-left hover:bg-tint flex items-center gap-2.5 text-gray-700 dark:text-gray-300 transition-colors"
          >
            <option.icon className="h-4 w-4 text-gray-500" />
            {option.label}
          </button>
        ))}
      </FloatingDropdown>

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
