"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useEditor, EditorContent, Editor, ReactRenderer } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Color, TextStyle } from "@tiptap/extension-text-style";
import Mention from "@tiptap/extension-mention";
import type { SuggestionProps, SuggestionKeyDownProps } from "@tiptap/suggestion";
import { EmojiPicker } from "@/components/ui/emoji-picker";
import {
  Bold,
  Italic,
  Strikethrough,
  Heading,
  Link as LinkIcon,
  TextQuote,
  Code,
  List,
  ListOrdered,
  Palette,
  Smile,
  Paperclip,
} from "lucide-react";
import { cn } from "@/lib/utils";

const AVATAR_COLORS = [
  "bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500",
  "bg-purple-500", "bg-cyan-500", "bg-orange-500", "bg-teal-500",
];

function getInitials(name: string): string {
  const cleaned = name.replace(/^(Mr\.?|Ms\.?|Mrs\.?)\s*/i, '').trim();
  const parts = cleaned.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (cleaned[0] || "?").toUpperCase();
}

const EDITOR_COLORS = [
  { label: "Red", color: "#dc2626" },
  { label: "Orange", color: "#ea580c" },
  { label: "Green", color: "#16a34a" },
  { label: "Blue", color: "#2563eb" },
  { label: "Purple", color: "#9333ea" },
  { label: "Gray", color: "#6b7280" },
];

interface ToolbarButtonProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  isActive?: boolean;
  onClick: () => void;
}

function ToolbarButton({ icon: Icon, label, isActive, onClick }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "p-1.5 rounded transition-colors",
        isActive
          ? "bg-[#a0704b] text-white"
          : "text-gray-600 dark:text-gray-400 hover:text-[#a0704b] hover:bg-[#ede0cf] dark:hover:bg-[#3d2e1e]"
      )}
      title={label}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}

// --- Mention suggestion list component ---
export interface MentionUser {
  id: number;
  label: string;
  pictureUrl?: string;
}

interface MentionListProps {
  items: MentionUser[];
  command: (item: MentionUser) => void;
}

interface MentionListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

import React from "react";

function MentionAvatar({ item }: { item: MentionUser }) {
  const [imgError, setImgError] = useState(false);
  if (item.pictureUrl && !imgError) {
    return (
      <img
        src={item.pictureUrl}
        alt={item.label}
        className="w-5 h-5 rounded-full object-cover flex-shrink-0"
        referrerPolicy="no-referrer"
        onError={() => setImgError(true)}
      />
    );
  }
  return (
    <span className={cn("w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0", AVATAR_COLORS[item.id % AVATAR_COLORS.length])}>
      {getInitials(item.label)}
    </span>
  );
}

const MentionList = React.forwardRef<MentionListRef, MentionListProps>(
  ({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => setSelectedIndex(0), [items]);

    React.useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }: { event: KeyboardEvent }) => {
        if (event.key === "ArrowUp") {
          setSelectedIndex((prev) => (prev + items.length - 1) % items.length);
          return true;
        }
        if (event.key === "ArrowDown") {
          setSelectedIndex((prev) => (prev + 1) % items.length);
          return true;
        }
        if (event.key === "Enter") {
          if (items[selectedIndex]) command(items[selectedIndex]);
          return true;
        }
        return false;
      },
    }));

    if (items.length === 0) return null;

    return (
      <div className="bg-white dark:bg-[#2a2a2a] rounded-lg shadow-xl border border-[#e8d4b8] dark:border-[#6b5a4a] p-1 min-w-[160px] max-h-[200px] overflow-y-auto z-50">
        {items.map((item, index) => (
          <button
            key={item.id}
            type="button"
            className={cn(
              "flex items-center gap-2 w-full px-2.5 py-1.5 text-xs rounded transition-colors text-left",
              index === selectedIndex
                ? "bg-[#f5ede3] dark:bg-[#3d3628] text-[#a0704b]"
                : "text-gray-700 dark:text-gray-300 hover:bg-[#f5ede3] dark:hover:bg-[#3d3628]"
            )}
            onClick={() => command(item)}
          >
            <MentionAvatar item={item} />
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    );
  }
);
MentionList.displayName = "MentionList";

interface InboxRichEditorProps {
  /** Called with Tiptap editor instance once created */
  onEditorReady?: (editor: Editor) => void;
  /** Called on every content change with HTML string */
  onUpdate: (html: string) => void;
  /** Trigger file input for image attachment */
  onAttachImage?: () => void;
  /** Called when images are pasted from clipboard */
  onPasteFiles?: (files: File[]) => void;
  /** Initial HTML content */
  initialContent?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Minimum height of editor area */
  minHeight?: string;
  /** List of mentionable users (for @mentions) */
  mentionUsers?: MentionUser[];
}

export default function InboxRichEditor({
  onEditorReady,
  onUpdate,
  onAttachImage,
  onPasteFiles,
  initialContent = "",
  placeholder = "Write your message...",
  minHeight = "150px",
  mentionUsers,
}: InboxRichEditorProps) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const colorPickerRef = useRef<HTMLDivElement>(null);
  const savedSelectionRef = useRef<{ from: number; to: number } | null>(null);

  // Keep mentionUsers in a ref so the suggestion config (created once) always sees latest
  const mentionUsersRef = useRef(mentionUsers);
  useEffect(() => { mentionUsersRef.current = mentionUsers; }, [mentionUsers]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        // Enable all features (unlike WeCom editor which disables lists/strike)
        codeBlock: false,
        horizontalRule: false,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-blue-600 dark:text-blue-400 underline cursor-pointer",
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
      TextStyle,
      Color,
      Mention.configure({
        HTMLAttributes: {
          class: "mention",
        },
        suggestion: {
          items: ({ query }: { query: string }) => {
            const users = mentionUsersRef.current || [];
            const getFirstName = (name: string) => {
              const parts = name.split(' ');
              return parts.length > 1 ? parts[1] : parts[0];
            };
            return users
              .filter((u) => u.label.toLowerCase().includes(query.toLowerCase()))
              .sort((a, b) => getFirstName(a.label).localeCompare(getFirstName(b.label)));
          },
          render: () => {
            let component: ReactRenderer<MentionListRef> | null = null;
            let popup: HTMLDivElement | null = null;

            const positionPopup = (rect: DOMRect, el: HTMLDivElement) => {
              const popupHeight = el.offsetHeight || 200;
              const spaceBelow = window.innerHeight - rect.bottom;
              const goAbove = spaceBelow < popupHeight + 8;
              el.style.left = `${rect.left}px`;
              el.style.top = goAbove
                ? `${rect.top + window.scrollY - popupHeight - 4}px`
                : `${rect.bottom + window.scrollY + 4}px`;
            };

            return {
              onStart: (props: SuggestionProps) => {
                component = new ReactRenderer(MentionList, {
                  props,
                  editor: props.editor,
                });

                popup = document.createElement("div");
                popup.style.position = "absolute";
                popup.style.zIndex = "9999";
                document.body.appendChild(popup);
                popup.appendChild(component.element);

                const rect = props.clientRect?.();
                if (rect && popup) {
                  positionPopup(rect, popup);
                }
              },
              onUpdate: (props: SuggestionProps) => {
                component?.updateProps(props);
                const rect = props.clientRect?.();
                if (rect && popup) {
                  positionPopup(rect, popup);
                }
              },
              onKeyDown: (props: SuggestionKeyDownProps) => {
                if (props.event.key === "Escape") {
                  popup?.remove();
                  component?.destroy();
                  popup = null;
                  component = null;
                  return true;
                }
                return component?.ref?.onKeyDown(props) ?? false;
              },
              onExit: () => {
                popup?.remove();
                component?.destroy();
                popup = null;
                component = null;
              },
            };
          },
        },
      }),
    ],
    content: initialContent,
    onUpdate: ({ editor }) => {
      onUpdate(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: `prose prose-sm dark:prose-invert max-w-none px-3 py-2 min-h-[${minHeight}] focus:outline-none text-gray-900 dark:text-white`,
      },
      handlePaste: (_view, event) => {
        const files = event.clipboardData?.files;
        if (files && files.length > 0) {
          const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
          if (imageFiles.length > 0 && onPasteFiles) {
            event.preventDefault();
            onPasteFiles(imageFiles);
            return true;
          }
        }
        return false;
      },
    },
  });

  // Expose editor to parent
  useEffect(() => {
    if (editor && onEditorReady) {
      onEditorReady(editor);
    }
  }, [editor, onEditorReady]);

  // Close color picker on click outside
  useEffect(() => {
    if (!showColorPicker) return;
    const handleClick = (e: MouseEvent) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) {
        setShowColorPicker(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showColorPicker]);

  const insertEmoji = useCallback(
    (emoji: string) => {
      editor?.commands.insertContent(emoji);
    },
    [editor]
  );

  const handleSetLink = useCallback(() => {
    if (!editor) return;

    const previousUrl = editor.getAttributes("link").href;
    const url = window.prompt("Enter URL:", previousUrl || "https://");

    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }

    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      window.alert("URL must start with http:// or https://");
      return;
    }

    if (editor.state.selection.empty) {
      // No text selected — insert URL as clickable link text
      editor.chain().focus().insertContent(`<a href="${url}">${url}</a>`).run();
    } else {
      // Text selected — apply link to selection
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    }
  }, [editor]);

  const handleToggleHeading = useCallback(() => {
    if (!editor) return;

    if (editor.isActive("heading", { level: 3 })) {
      editor.chain().focus().setParagraph().run();
    } else if (editor.isActive("heading", { level: 2 })) {
      editor.chain().focus().toggleHeading({ level: 3 }).run();
    } else if (editor.isActive("heading", { level: 1 })) {
      editor.chain().focus().toggleHeading({ level: 2 }).run();
    } else {
      editor.chain().focus().toggleHeading({ level: 1 }).run();
    }
  }, [editor]);

  const handleSetColor = useCallback(
    (color: string) => {
      if (!editor) return;
      const sel = savedSelectionRef.current;
      const { from, to } = (sel && sel.from !== sel.to)
        ? sel
        : editor.state.selection;
      if (from === to) return;
      const { tr, schema } = editor.state;
      const markType = schema.marks.textStyle;
      if (markType) {
        tr.addMark(from, to, markType.create({ color }));
        editor.view.dispatch(tr);
      }
      setShowColorPicker(false);
    },
    [editor]
  );

  const handleRemoveColor = useCallback(() => {
    if (!editor) return;
    const sel = savedSelectionRef.current;
    const { from, to } = (sel && sel.from !== sel.to)
      ? sel
      : editor.state.selection;
    if (from === to) return;
    const { tr, schema } = editor.state;
    const markType = schema.marks.textStyle;
    if (markType) {
      tr.removeMark(from, to, markType);
      editor.view.dispatch(tr);
    }
    setShowColorPicker(false);
  }, [editor]);

  if (!editor) return null;

  const activeColor = editor.getAttributes("textStyle").color;

  return (
    <div className="border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg bg-white dark:bg-[#2a2a2a]">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 bg-[#f5ede3] dark:bg-[#2d2820] border-b border-[#e8d4b8] dark:border-[#6b5a4a] flex-wrap rounded-t-lg" onMouseDown={(e) => e.preventDefault()}>
        <ToolbarButton
          icon={Bold}
          label="Bold"
          isActive={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        />
        <ToolbarButton
          icon={Italic}
          label="Italic"
          isActive={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        />
        <ToolbarButton
          icon={Strikethrough}
          label="Strikethrough"
          isActive={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        />
        <ToolbarButton
          icon={Heading}
          label="Heading (cycles H1→H2→H3→text)"
          isActive={editor.isActive("heading")}
          onClick={handleToggleHeading}
        />
        <ToolbarButton
          icon={LinkIcon}
          label="Link"
          isActive={editor.isActive("link")}
          onClick={handleSetLink}
        />

        {/* Separator */}
        <div className="w-px h-5 bg-[#e8d4b8] dark:bg-[#6b5a4a] mx-0.5" />

        <ToolbarButton
          icon={List}
          label="Bullet List"
          isActive={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        />
        <ToolbarButton
          icon={ListOrdered}
          label="Numbered List"
          isActive={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        />
        <ToolbarButton
          icon={TextQuote}
          label="Blockquote"
          isActive={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        />
        <ToolbarButton
          icon={Code}
          label="Inline Code"
          isActive={editor.isActive("code")}
          onClick={() => editor.chain().focus().toggleCode().run()}
        />

        {/* Separator */}
        <div className="w-px h-5 bg-[#e8d4b8] dark:bg-[#6b5a4a] mx-0.5" />

        {/* Color picker */}
        <div className="relative" ref={colorPickerRef}>
          <button
            type="button"
            onClick={() => {
              if (!showColorPicker && editor) {
                const { from, to } = editor.state.selection;
                savedSelectionRef.current = { from, to };
              }
              setShowColorPicker(!showColorPicker);
            }}
            className={cn(
              "p-1.5 rounded transition-colors",
              activeColor
                ? "ring-2 ring-offset-1 ring-[#a0704b]"
                : "text-gray-600 dark:text-gray-400 hover:text-[#a0704b] hover:bg-[#ede0cf] dark:hover:bg-[#3d2e1e]"
            )}
            title="Text Color"
          >
            <Palette className="w-4 h-4" style={activeColor ? { color: activeColor } : undefined} />
          </button>
          {showColorPicker && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-[#2a2a2a] rounded-lg shadow-xl border border-[#e8d4b8] dark:border-[#6b5a4a] p-1.5 min-w-[140px]">
              {EDITOR_COLORS.map((c) => (
                <button
                  key={c.color}
                  type="button"
                  onMouseDown={() => handleSetColor(c.color)}
                  className="flex items-center gap-2 w-full px-2.5 py-1.5 text-xs rounded hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] transition-colors"
                >
                  <span
                    className="w-3 h-3 rounded-full border border-gray-300 dark:border-gray-600"
                    style={{ backgroundColor: c.color }}
                  />
                  <span className="text-gray-700 dark:text-gray-300">{c.label}</span>
                </button>
              ))}
              {activeColor && (
                <>
                  <div className="border-t border-[#e8d4b8] dark:border-[#6b5a4a] my-1" />
                  <button
                    type="button"
                    onMouseDown={handleRemoveColor}
                    className="flex items-center gap-2 w-full px-2.5 py-1.5 text-xs rounded hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] transition-colors text-gray-500"
                  >
                    Remove color
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Emoji + Image buttons */}
        <div className="relative flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="p-1.5 rounded text-gray-400 hover:text-[#a0704b] hover:bg-[#ede0cf] dark:hover:bg-[#3d2e1e] transition-colors"
            title="Insert emoji"
          >
            <Smile className="w-4 h-4" />
          </button>
          {onAttachImage && (
            <button
              type="button"
              onClick={onAttachImage}
              className="p-1.5 rounded text-gray-400 hover:text-[#a0704b] hover:bg-[#ede0cf] dark:hover:bg-[#3d2e1e] transition-colors"
              title="Attach file"
            >
              <Paperclip className="w-4 h-4" />
            </button>
          )}
          <EmojiPicker
            isOpen={showEmojiPicker}
            onClose={() => setShowEmojiPicker(false)}
            onSelect={insertEmoji}
          />
        </div>
      </div>

      {/* Editor content */}
      <EditorContent editor={editor} />

      {/* Mention styling */}
      <style jsx global>{`
        .mention {
          background-color: #f5ede3;
          border-radius: 4px;
          padding: 1px 4px;
          color: #a0704b;
          font-weight: 600;
          font-size: 0.875em;
        }
        .dark .mention {
          background-color: #3d3628;
          color: #c49a6c;
        }
      `}</style>
    </div>
  );
}
