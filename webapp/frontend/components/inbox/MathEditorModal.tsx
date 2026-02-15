"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface MathEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (latex: string, mode: "inline" | "block") => void;
  initialLatex?: string;
  initialMode?: "inline" | "block";
}

const isMac =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);

const KEYBOARD_THEME_CSS = `
:root {
  --keyboard-zindex: 10000;
  --keyboard-accent-color: #a0704b;
  --keyboard-background: #f5ede3;
  --keyboard-border: #e8d4b8;
  --keycap-background: #fff;
  --keycap-background-hover: #faf6f1;
  --keycap-border: #e8d4b8;
  --keycap-border-bottom: #d4c0a8;
  --keycap-text: #1f2937;
  --keycap-text-active: #fff;
  --keycap-secondary-background: #e8d4b8;
  --keycap-secondary-background-hover: #ddd0be;
  --keycap-secondary-text: #4b3621;
  --keycap-secondary-border: #d4c0a8;
  --keycap-secondary-border-bottom: #c4ad94;
  --keyboard-toolbar-text: #4b3621;
  --keyboard-toolbar-text-active: #a0704b;
  --keyboard-toolbar-background-hover: #ede0cf;
}
@media (prefers-color-scheme: dark) {
  :root {
    --keyboard-background: #1e1a15;
    --keyboard-border: #6b5a4a;
    --keycap-background: #2a2518;
    --keycap-background-hover: #3d3628;
    --keycap-border: #6b5a4a;
    --keycap-border-bottom: #4a3d30;
    --keycap-text: #e3d5c5;
    --keycap-secondary-background: #3d3628;
    --keycap-secondary-background-hover: #4d4638;
    --keycap-secondary-text: #e3d5c5;
    --keycap-secondary-border: #6b5a4a;
    --keycap-secondary-border-bottom: #4a3d30;
    --keyboard-toolbar-text: #c9b99a;
    --keyboard-toolbar-text-active: #c9a96e;
    --keyboard-toolbar-background-hover: #3d3628;
  }
}
`;

export default function MathEditorModal({
  isOpen,
  onClose,
  onInsert,
  initialLatex = "",
  initialMode = "inline",
}: MathEditorModalProps) {
  const [mode, setMode] = useState<"inline" | "block">(initialMode);
  const [latex, setLatex] = useState(initialLatex);
  const [mathliveLoaded, setMathliveLoaded] = useState(false);
  const mathfieldRef = useRef<HTMLElement | null>(null);
  const inputListenerRef = useRef<(() => void) | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setLatex(initialLatex);
    }
  }, [isOpen, initialLatex, initialMode]);

  // Lazy-load mathlive when modal first opens
  useEffect(() => {
    if (!isOpen || mathliveLoaded) return;
    import("mathlive").then(() => {
      setMathliveLoaded(true);
    });
  }, [isOpen, mathliveLoaded]);

  // Configure mathfield after it renders
  useEffect(() => {
    if (!mathliveLoaded || !isOpen) return;

    let cancelled = false;
    let showTimer: ReturnType<typeof setTimeout>;

    const initTimer = setTimeout(() => {
      if (cancelled) return;
      const mf = mathfieldRef.current as any;
      if (!mf) return;

      // Set initial value
      mf.value = initialLatex;

      // Manual keyboard policy — we control when it shows
      mf.mathVirtualKeyboardPolicy = "manual";

      // Remove previous listener if any, then add new one
      if (inputListenerRef.current) {
        mf.removeEventListener("input", inputListenerRef.current);
      }
      const handleInput = () => {
        setLatex(mf.value || "");
      };
      inputListenerRef.current = handleInput;
      mf.addEventListener("input", handleInput);

      // Focus first — this triggers internal connectToVirtualKeyboard()
      // which runs after a 60ms delay inside mathlive
      mf.focus();

      // After the connection is established, show the keyboard
      showTimer = setTimeout(() => {
        if (cancelled) return;
        const kbd = (window as any).mathVirtualKeyboard;
        if (kbd) {
          kbd.show({ animate: true });
        }
      }, 100);
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(initTimer);
      clearTimeout(showTimer);
      // Clean up input listener
      const mf = mathfieldRef.current as any;
      if (mf && inputListenerRef.current) {
        mf.removeEventListener("input", inputListenerRef.current);
        inputListenerRef.current = null;
      }
    };
  }, [mathliveLoaded, isOpen, initialLatex]);

  // Hide virtual keyboard when modal closes
  useEffect(() => {
    if (!isOpen && mathliveLoaded) {
      const kbd = (window as any).mathVirtualKeyboard;
      if (kbd) {
        kbd.hide();
      }
    }
  }, [isOpen, mathliveLoaded]);

  const handleInsert = useCallback(() => {
    if (!latex.trim()) return;
    onInsert(latex.trim(), mode);
    onClose();
  }, [latex, mode, onInsert, onClose]);

  const handleDelete = useCallback(() => {
    onInsert("", mode);
    onClose();
  }, [mode, onInsert, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleInsert();
      }
    },
    [onClose, handleInsert]
  );

  const modeDescription = useMemo(
    () =>
      mode === "inline"
        ? "Renders within text flow"
        : "Centered on its own line",
    [mode]
  );

  if (!isOpen) return null;

  const isEditing = !!initialLatex;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh]"
      onKeyDown={handleKeyDown}
    >
      {/* MathLive keyboard theme — warm brown palette */}
      <style>{KEYBOARD_THEME_CSS}</style>

      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        style={{ maxWidth: "32rem" }}
        className="relative w-full mx-4 bg-white dark:bg-[#2a2a2a] rounded-xl shadow-2xl border border-[#e8d4b8] dark:border-[#6b5a4a] animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#e8d4b8]/40 dark:border-[#6b5a4a]/40">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            {isEditing ? "Edit Equation" : "Insert Equation"}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>

        {/* Mathfield */}
        <div className="px-4 pt-4 pb-2">
          {mathliveLoaded ? (
            <div className="rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a]">
              <math-field
                ref={mathfieldRef as any}
                aria-label="Math equation input"
                style={{
                  display: "block",
                  width: "100%",
                  minHeight: "60px",
                  fontSize: "22px",
                  padding: "12px",
                  borderRadius: "8px",
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  // --hue cascades into shadow DOM to tint toggle/menu icons, caret, selection
                  "--hue": "27",
                } as React.CSSProperties}
              />
            </div>
          ) : (
            <div className="flex items-center justify-center h-16 text-sm text-gray-400">
              Loading math editor...
            </div>
          )}
        </div>

        {/* Mode toggle + actions */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-[#e8d4b8]/40 dark:border-[#6b5a4a]/40">
          <div>
            <div className="flex items-center gap-1 bg-[#f5ede3]/60 dark:bg-[#3d3628]/40 rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => setMode("inline")}
                className={cn(
                  "px-3 py-1 text-xs font-medium rounded-md transition-colors",
                  mode === "inline"
                    ? "bg-white dark:bg-[#2a2a2a] text-[#a0704b] shadow-sm"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                )}
              >
                Inline
              </button>
              <button
                type="button"
                onClick={() => setMode("block")}
                className={cn(
                  "px-3 py-1 text-xs font-medium rounded-md transition-colors",
                  mode === "block"
                    ? "bg-white dark:bg-[#2a2a2a] text-[#a0704b] shadow-sm"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                )}
              >
                Block
              </button>
            </div>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 ml-0.5">
              {modeDescription}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-400 dark:text-gray-500 hidden sm:inline">
              {isMac ? "⌘" : "Ctrl+"}Enter
            </span>
            {isEditing && (
              <button
                onClick={handleDelete}
                className="px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
              >
                Delete
              </button>
            )}
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleInsert}
              disabled={!latex.trim()}
              className="px-4 py-1.5 text-xs font-medium bg-[#a0704b] hover:bg-[#8b5f3c] text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isEditing ? "Update" : "Insert"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// TypeScript declaration for math-field custom element
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "math-field": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & { "aria-label"?: string },
        HTMLElement
      >;
    }
  }
}
