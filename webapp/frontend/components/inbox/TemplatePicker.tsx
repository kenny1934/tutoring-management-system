"use client";

import React, { useState, useRef } from "react";
import { FileText, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useClickOutside } from "@/lib/hooks";
import type { MessageTemplate } from "@/types";

interface TemplatePickerProps {
  templates: MessageTemplate[];
  onSelect: (content: string) => void;
  onDelete?: (templateId: number) => void;
  onCreate?: (title: string, content: string) => void;
}

export default function TemplatePicker({ templates, onSelect, onDelete, onCreate }: TemplatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const popoverRef = useRef<HTMLDivElement>(null);

  useClickOutside(popoverRef, () => { setIsOpen(false); setShowCreate(false); });

  const globalTemplates = templates.filter(t => t.is_global);
  const personalTemplates = templates.filter(t => !t.is_global);

  const handleCreate = () => {
    if (!newTitle.trim() || !newContent.trim()) return;
    onCreate?.(newTitle.trim(), newContent.trim());
    setNewTitle("");
    setNewContent("");
    setShowCreate(false);
  };

  return (
    <div className="relative" ref={popoverRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "p-1.5 rounded transition-colors",
          isOpen
            ? "text-[#a0704b] bg-[#f5ede3]/60 dark:bg-[#3d3628]/50"
            : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        )}
        title="Message templates"
      >
        <FileText className="h-4 w-4" />
      </button>

      {isOpen && (
        <div className="absolute bottom-full right-0 mb-1 w-64 bg-white dark:bg-[#2a2a2a] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg shadow-lg z-20 max-h-64 overflow-y-auto">
          <div className="flex items-center justify-between px-3 py-2 border-b border-[#e8d4b8]/30 dark:border-[#6b5a4a]/30">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Templates</span>
            <div className="flex items-center gap-1">
              {onCreate && (
                <button
                  type="button"
                  onClick={() => setShowCreate(!showCreate)}
                  className="p-1 text-gray-400 hover:text-[#a0704b] rounded transition-colors"
                  title="Create template"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => { setIsOpen(false); setShowCreate(false); }}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {showCreate && (
            <div className="p-2 border-b border-[#e8d4b8]/30 dark:border-[#6b5a4a]/30 space-y-1.5">
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Template name"
                className="w-full px-2 py-1 text-xs border border-[#e8d4b8] dark:border-[#6b5a4a] rounded bg-transparent focus:outline-none focus:ring-1 focus:ring-[#a0704b]"
              />
              <textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="Template content"
                rows={2}
                className="w-full px-2 py-1 text-xs border border-[#e8d4b8] dark:border-[#6b5a4a] rounded bg-transparent resize-none focus:outline-none focus:ring-1 focus:ring-[#a0704b]"
              />
              <button
                type="button"
                onClick={handleCreate}
                disabled={!newTitle.trim() || !newContent.trim()}
                className="w-full px-2 py-1 text-xs font-medium bg-[#a0704b] text-white rounded hover:bg-[#8b5f3c] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Save template
              </button>
            </div>
          )}

          <div className="py-1">
            {personalTemplates.length > 0 && (
              <>
                <div className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">My Templates</div>
                {personalTemplates.map(t => (
                  <div key={t.id} className="group flex items-center">
                    <button
                      type="button"
                      onClick={() => { onSelect(t.content); setIsOpen(false); }}
                      className="flex-1 text-left px-3 py-1.5 text-sm hover:bg-[#f5ede3]/60 dark:hover:bg-[#3d3628]/50 transition-colors"
                    >
                      <div className="font-medium text-gray-700 dark:text-gray-200 text-xs">{t.title}</div>
                      <div className="text-[11px] text-gray-400 truncate">{t.content}</div>
                    </button>
                    {onDelete && (
                      <button
                        type="button"
                        onClick={() => onDelete(t.id)}
                        className="p-1.5 mr-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
              </>
            )}

            {globalTemplates.length > 0 && (
              <>
                <div className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Quick Replies</div>
                {globalTemplates.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => { onSelect(t.content); setIsOpen(false); }}
                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-[#f5ede3]/60 dark:hover:bg-[#3d3628]/50 transition-colors"
                  >
                    <div className="font-medium text-gray-700 dark:text-gray-200 text-xs">{t.title}</div>
                    <div className="text-[11px] text-gray-400 truncate">{t.content}</div>
                  </button>
                ))}
              </>
            )}

            {templates.length === 0 && (
              <div className="px-3 py-3 text-xs text-gray-400 text-center">No templates yet</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
