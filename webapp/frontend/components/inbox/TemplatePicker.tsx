"use client";

import React, { useState, useRef } from "react";
import { LayoutTemplate, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import FloatingDropdown from "@/components/inbox/FloatingDropdown";
import { Button, IconButton, Input, Textarea } from "@/components/controls";
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
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = () => { setIsOpen(false); setShowCreate(false); };

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
    <div>
      <IconButton
        ref={triggerRef}
        size="sm"
        icon={LayoutTemplate}
        label="Message templates"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className={cn(isOpen && "bg-tint text-accent-ink")}
      />

      <FloatingDropdown
        triggerRef={triggerRef}
        isOpen={isOpen}
        onClose={close}
        align="right"
        className="w-64 bg-white dark:bg-[#2a2a2a] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg shadow-lg max-h-64 overflow-y-auto"
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-line/30">
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Templates</span>
          <div className="flex items-center gap-1">
            {onCreate && (
              <IconButton
                size="sm"
                icon={Plus}
                label="Create template"
                onClick={() => setShowCreate(!showCreate)}
                aria-expanded={showCreate}
              />
            )}
            <IconButton size="sm" icon={X} label="Close" onClick={close} />
          </div>
        </div>

        {showCreate && (
          <div className="p-2 border-b border-line/30 space-y-1.5">
            <Input
              size="sm"
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Template name"
              aria-label="Template name"
            />
            <Textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="Template content"
              aria-label="Template content"
              rows={2}
              className="min-h-0 resize-none px-2 py-1 text-xs"
            />
            <Button
              size="sm"
              variant="primary"
              className="w-full"
              onClick={handleCreate}
              disabled={!newTitle.trim() || !newContent.trim()}
            >
              Save template
            </Button>
          </div>
        )}

        <div className="py-1">
          {personalTemplates.length > 0 && (
            <>
              <div className="px-3 py-1 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">My templates</div>
              {personalTemplates.map(t => (
                <div key={t.id} className="group flex items-center">
                  <button
                    type="button"
                    onClick={() => { onSelect(t.content); setIsOpen(false); }}
                    className="flex-1 text-left px-3 py-1.5 text-sm hover:bg-[#f5ede3]/60 dark:hover:bg-[#3d3628]/50 transition-colors"
                  >
                    <div className="font-medium text-gray-700 dark:text-gray-200 text-xs">{t.title}</div>
                    <div className="text-[11px] text-gray-500 truncate">{t.content}</div>
                  </button>
                  {onDelete && (
                    <button
                      type="button"
                      onClick={() => { if (window.confirm("Delete this template?")) onDelete(t.id); }}
                      title="Delete template"
                      aria-label={`Delete the ${t.title} template`}
                      className="p-1.5 mr-1 text-gray-300 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-all"
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
              <div className="px-3 py-1 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Quick replies</div>
              {globalTemplates.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => { onSelect(t.content); setIsOpen(false); }}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-[#f5ede3]/60 dark:hover:bg-[#3d3628]/50 transition-colors"
                >
                  <div className="font-medium text-gray-700 dark:text-gray-200 text-xs">{t.title}</div>
                  <div className="text-[11px] text-gray-500 truncate">{t.content}</div>
                </button>
              ))}
            </>
          )}

          {templates.length === 0 && (
            <div className="px-3 py-3 text-xs text-gray-500 text-center">No templates yet</div>
          )}
        </div>
      </FloatingDropdown>
    </div>
  );
}
