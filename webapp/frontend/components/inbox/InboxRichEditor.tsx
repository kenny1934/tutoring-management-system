"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useEditor, EditorContent, Editor, ReactRenderer } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Color, TextStyle } from "@tiptap/extension-text-style";
import Mention from "@tiptap/extension-mention";
import { Mathematics } from "@tiptap/extension-mathematics";
import { Extension, InputRule } from "@tiptap/core";
import type { Node as PmNode } from "@tiptap/pm/model";
import "katex/dist/katex.min.css";
import type { SuggestionProps, SuggestionKeyDownProps } from "@tiptap/suggestion";
import { EmojiPicker } from "@/components/ui/emoji-picker";
import TemplatePicker from "@/components/inbox/TemplatePicker";
import FloatingDropdown from "@/components/inbox/FloatingDropdown";
import type { MessageTemplate } from "@/types";
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
  Expand,
  Sigma,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AVATAR_COLORS, getInitials } from "@/lib/avatar-utils";

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
        "p-1.5 rounded transition-colors focus-visible:ring-2 focus-visible:ring-[#a0704b]/40 focus-visible:ring-offset-1",
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
  /** Message templates (shown in toolbar) */
  templates?: MessageTemplate[];
  onCreateTemplate?: (title: string, content: string) => void;
  onDeleteTemplate?: (templateId: number) => void;
  /** Open full editor callback (shown in toolbar) */
  onOpenFullEditor?: () => void;
}

export default function InboxRichEditor({
  onEditorReady,
  onUpdate,
  onPasteFiles,
  initialContent = "",
  placeholder = "Write your message...",
  minHeight = "150px",
  mentionUsers,
  templates,
  onCreateTemplate,
  onDeleteTemplate,
  onOpenFullEditor,
}: InboxRichEditorProps) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const colorButtonRef = useRef<HTMLButtonElement>(null);
  const savedSelectionRef = useRef<{ from: number; to: number } | null>(null);

  // Keep mentionUsers in a ref so the suggestion config (created once) always sees latest
  const mentionUsersRef = useRef(mentionUsers);
  useEffect(() => { mentionUsersRef.current = mentionUsers; }, [mentionUsers]);

  // Ref for editor instance — used by onClick closures that are created before editor exists
  const editorInstanceRef = useRef<Editor | null>(null);

  // Custom input rules for standard LaTeX delimiters ($...$ and $$...$$)
  // The official extension uses $$...$$ for inline and $$$...$$$  for block, which is non-standard
  const MathInputRules = useCallback(() => Extension.create({
    name: 'mathInputRules',
    addInputRules() {
      const inlineMathType = this.editor.schema.nodes.inlineMath;
      const blockMathType = this.editor.schema.nodes.blockMath;
      return [
        // $...$ for inline math (single dollar signs)
        new InputRule({
          find: /(^|[^$])(\$([^$\n]+?)\$)(?!\$)/,
          handler: ({ state, range, match }) => {
            const latex = match[3];
            const { tr } = state;
            const start = range.from + match[1].length;
            tr.replaceWith(start, range.to, inlineMathType.create({ latex }));
          },
        }),
        // $$...$$ for block math (at start of line)
        new InputRule({
          find: /^\$\$([^$]+)\$\$$/,
          handler: ({ state, range, match }) => {
            const latex = match[1];
            const { tr } = state;
            tr.replaceWith(range.from, range.to, blockMathType.create({ latex }));
          },
        }),
      ];
    },
  }), []);

  // Click handler for math nodes — uses editorInstanceRef
  const handleMathClick = useCallback((node: PmNode, pos: number, type: 'inline' | 'block') => {
    const ed = editorInstanceRef.current;
    if (!ed) return;
    const latex = node.attrs.latex || '';
    const newLatex = prompt('Edit equation (LaTeX):', latex);
    if (newLatex === null) return; // cancelled
    if (newLatex === '') {
      if (type === 'inline') {
        ed.chain().focus().deleteInlineMath({ pos }).run();
      } else {
        ed.chain().focus().deleteBlockMath({ pos }).run();
      }
    } else if (newLatex !== latex) {
      if (type === 'inline') {
        ed.chain().focus().updateInlineMath({ latex: newLatex, pos }).run();
      } else {
        ed.chain().focus().updateBlockMath({ latex: newLatex, pos }).run();
      }
    }
  }, []);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        // Enable all features (unlike WeCom editor which disables lists/strike)
        codeBlock: false,
        horizontalRule: false,
        link: {
          openOnClick: false,
          HTMLAttributes: {
            class: "text-blue-600 dark:text-blue-400 underline cursor-pointer",
          },
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
      TextStyle,
      Color,
      Mathematics.configure({
        katexOptions: {
          throwOnError: false,
        },
        inlineOptions: {
          onClick: (node: PmNode, pos: number) => handleMathClick(node, pos, 'inline'),
        },
        blockOptions: {
          onClick: (node: PmNode, pos: number) => handleMathClick(node, pos, 'block'),
        },
      }),
      MathInputRules(),
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

  // Expose editor to parent + store ref for onClick handlers
  useEffect(() => {
    if (editor) {
      editorInstanceRef.current = editor;
      if (onEditorReady) onEditorReady(editor);
    }
  }, [editor, onEditorReady]);


  const insertEmoji = useCallback(
    (emoji: string) => {
      editor?.commands.insertContent(emoji);
    },
    [editor]
  );

  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState("");
  const linkInputRef = useRef<HTMLInputElement>(null);

  const handleSetLink = useCallback(() => {
    if (!editor) return;
    const previousUrl = editor.getAttributes("link").href;
    setLinkUrl(previousUrl || "https://");
    setLinkError("");
    setShowLinkInput(true);
    setTimeout(() => linkInputRef.current?.select(), 50);
  }, [editor]);

  const handleLinkSubmit = useCallback(() => {
    if (!editor) return;
    if (linkUrl === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      setShowLinkInput(false);
      return;
    }
    if (!linkUrl.startsWith("http://") && !linkUrl.startsWith("https://")) {
      setLinkError("URL must start with http:// or https://");
      return;
    }
    if (editor.state.selection.empty) {
      editor.chain().focus().insertContent(`<a href="${linkUrl}">${linkUrl}</a>`).run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href: linkUrl }).run();
    }
    setShowLinkInput(false);
  }, [editor, linkUrl]);

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
        <div className="w-px h-5 bg-[#d4c0a8] dark:bg-[#6b5a4a] mx-0.5" />

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
        <ToolbarButton
          icon={Sigma}
          label="Math equation ($...$)"
          isActive={editor.isActive('inlineMath') || editor.isActive('blockMath')}
          onClick={() => {
            const { from, to } = editor.state.selection;
            const selectedText = from !== to ? editor.state.doc.textBetween(from, to) : '';
            const latex = selectedText || 'x^2';
            editor.chain().focus().command(({ tr }) => {
              const mathNode = editor.schema.nodes.inlineMath.create({ latex });
              tr.replaceWith(from, to, mathNode);
              return true;
            }).run();
          }}
        />

        {/* Separator */}
        <div className="w-px h-5 bg-[#d4c0a8] dark:bg-[#6b5a4a] mx-0.5" />

        {/* Color picker */}
        <div>
          <button
            ref={colorButtonRef}
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
          <FloatingDropdown
            triggerRef={colorButtonRef}
            isOpen={showColorPicker}
            onClose={() => setShowColorPicker(false)}
            align="left"
            className="bg-white dark:bg-[#2a2a2a] rounded-lg shadow-xl border border-[#e8d4b8] dark:border-[#6b5a4a] p-1.5 min-w-[140px]"
          >
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
          </FloatingDropdown>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right-side toolbar buttons */}
        <div className="relative flex items-center gap-0.5">
          {templates && templates.length > 0 && (
            <TemplatePicker
              templates={templates}
              onSelect={(content) => editor?.commands.insertContent(content)}
              onCreate={onCreateTemplate}
              onDelete={onDeleteTemplate}
            />
          )}
          <button
            ref={emojiButtonRef}
            type="button"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="p-1.5 rounded text-gray-400 hover:text-[#a0704b] hover:bg-[#ede0cf] dark:hover:bg-[#3d2e1e] transition-colors focus-visible:ring-2 focus-visible:ring-[#a0704b]/40 focus-visible:ring-offset-1"
            title="Insert emoji"
          >
            <Smile className="w-4 h-4" />
          </button>
          <EmojiPicker
            triggerRef={emojiButtonRef}
            isOpen={showEmojiPicker}
            onClose={() => setShowEmojiPicker(false)}
            onSelect={insertEmoji}
          />
        </div>
      </div>

      {/* Inline link input bar */}
      {showLinkInput && (
        <div className="flex items-center gap-2 px-3 py-2 bg-[#faf6f1] dark:bg-[#2a2518] border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
          <LinkIcon className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
          <input
            ref={linkInputRef}
            type="url"
            value={linkUrl}
            onChange={(e) => { setLinkUrl(e.target.value); setLinkError(""); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleLinkSubmit(); } else if (e.key === "Escape") setShowLinkInput(false); }}
            placeholder="https://example.com"
            className="flex-1 text-sm bg-transparent outline-none text-gray-900 dark:text-white placeholder-gray-400"
          />
          {linkError && <span className="text-xs text-red-500 flex-shrink-0">{linkError}</span>}
          <button type="button" onClick={handleLinkSubmit} className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline">Apply</button>
          <button type="button" onClick={() => setShowLinkInput(false)} className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">Cancel</button>
        </div>
      )}

      {/* Editor content */}
      <div className="relative">
        <EditorContent editor={editor} />
        {onOpenFullEditor && (
          <button
            type="button"
            onClick={onOpenFullEditor}
            className="absolute bottom-1 right-1 p-1 rounded text-gray-400 hover:text-[#a0704b] hover:bg-[#ede0cf] dark:text-gray-500 dark:hover:text-[#c9a96e] dark:hover:bg-[#3d2e1e] transition-colors"
            title="Open full editor"
          >
            <Expand className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

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
        .tiptap [data-type="inline-math"],
        .tiptap [data-type="block-math"] {
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
