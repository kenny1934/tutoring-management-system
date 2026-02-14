"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useEditor, EditorContent, Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Color, TextStyle } from "@tiptap/extension-text-style";
import { EmojiPicker } from "@/components/ui/emoji-picker";
import {
  Bold,
  Italic,
  Heading,
  Link as LinkIcon,
  TextQuote,
  Code,
  Palette,
  Smile,
  Image as ImageIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

// WeCom only supports these 3 named colors
const WECOM_COLORS = [
  { id: "info", label: "Green", color: "#00b050" },
  { id: "comment", label: "Gray", color: "#888888" },
  { id: "warning", label: "Orange", color: "#ff6600" },
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

interface WecomRichEditorProps {
  /** Called with Tiptap editor instance once created */
  onEditorReady?: (editor: Editor) => void;
  /** Called on every content change with HTML string */
  onUpdate: (html: string) => void;
  /** Trigger file input for image attachment */
  onAttachImage?: () => void;
  /** Initial HTML content */
  initialContent?: string;
}

export default function WecomRichEditor({
  onEditorReady,
  onUpdate,
  onAttachImage,
  initialContent = "",
}: WecomRichEditorProps) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const colorPickerRef = useRef<HTMLDivElement>(null);
  const savedSelectionRef = useRef<{ from: number; to: number } | null>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        // Disable features WeCom doesn't support
        strike: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
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
        placeholder: "Type your message...",
      }),
      TextStyle,
      Color,
    ],
    content: initialContent,
    onUpdate: ({ editor }) => {
      onUpdate(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class:
          "prose prose-sm dark:prose-invert max-w-none px-3 py-2 min-h-[150px] focus:outline-none text-gray-900 dark:text-white",
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

    if (url === null) return; // Cancelled
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }

    // Basic URL validation
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      window.alert("URL must start with http:// or https://");
      return;
    }

    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor]);

  const handleToggleHeading = useCallback(() => {
    if (!editor) return;

    // Cycle: paragraph → h1 → h2 → h3 → paragraph
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
      <div className="flex items-center gap-0.5 px-2 py-1.5 bg-[#f5ede3] dark:bg-[#2a2215] border-b border-[#e8d4b8] dark:border-[#6b5a4a] flex-wrap rounded-t-lg" onMouseDown={(e) => e.preventDefault()}>
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
              {WECOM_COLORS.map((c) => (
                <button
                  key={c.id}
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
            ref={emojiButtonRef}
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
              title="Attach image"
            >
              <ImageIcon className="w-4 h-4" />
            </button>
          )}
          <EmojiPicker
            triggerRef={emojiButtonRef}
            isOpen={showEmojiPicker}
            onClose={() => setShowEmojiPicker(false)}
            onSelect={insertEmoji}
          />
        </div>
      </div>

      {/* Editor content */}
      <EditorContent editor={editor} />
    </div>
  );
}
