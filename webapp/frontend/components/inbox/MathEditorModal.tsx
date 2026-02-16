"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { X, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { KEYBOARD_THEME_CSS } from "@/lib/mathlive-theme";
import { patchMathLiveMenu } from "@/lib/mathlive-utils";

interface MathEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (latex: string, mode: "inline" | "block") => void;
  initialLatex?: string;
  initialMode?: "inline" | "block";
}

const isMac =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);

const MATH_TEMPLATES = [
  { label: "Fraction", latex: "\\frac{a}{b}" },
  { label: "Quadratic formula", latex: "x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}" },
  { label: "Pythagorean theorem", latex: "a^2 + b^2 = c^2" },
  { label: "System of equations", latex: "\\begin{cases} ax + by = c \\\\ dx + ey = f \\end{cases}" },
  { label: "Derivative", latex: "\\frac{d}{dx} f(x)" },
  { label: "Integral", latex: "\\int_{a}^{b} f(x) \\, dx" },
  { label: "Limit", latex: "\\lim_{x \\to a} f(x)" },
  { label: "Summation", latex: "\\sum_{i=1}^{n} a_i" },
  { label: "Matrix 2\u00D72", latex: "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}" },
  { label: "Matrix 3\u00D73", latex: "\\begin{pmatrix} a & b & c \\\\ d & e & f \\\\ g & h & i \\end{pmatrix}" },
  { label: "sin\u00B2 + cos\u00B2 = 1", latex: "\\sin^2\\theta + \\cos^2\\theta = 1" },
  { label: "tan = sin/cos", latex: "\\tan\\theta = \\frac{\\sin\\theta}{\\cos\\theta}" },
];


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
  const [showTemplates, setShowTemplates] = useState(false);
  const [kbdHeight, setKbdHeight] = useState(0);
  const mathfieldRef = useRef<HTMLElement | null>(null);
  const inputListenerRef = useRef<(() => void) | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setLatex(initialLatex);
      setShowTemplates(false);
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

  // Track virtual keyboard height for mobile layout
  useEffect(() => {
    if (!mathliveLoaded || !isOpen) return;
    const kbd = (window as any).mathVirtualKeyboard;
    if (!kbd) return;
    const handleGeometry = () => {
      const rect = kbd.boundingRect;
      setKbdHeight(rect?.height ?? 0);
    };
    kbd.addEventListener("geometrychange", handleGeometry);
    return () => {
      kbd.removeEventListener("geometrychange", handleGeometry);
      setKbdHeight(0);
    };
  }, [mathliveLoaded, isOpen]);

  // Patch MathLive menu to prevent scrim from dismissing on initial click
  useEffect(() => {
    if (!mathliveLoaded || !isOpen) return;
    return patchMathLiveMenu(mathfieldRef);
  }, [mathliveLoaded, isOpen]);

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
      className="fixed inset-0 z-[100] flex items-start justify-center sm:pt-[10vh]"
      onKeyDown={handleKeyDown}
    >
      {/* MathLive keyboard theme — warm brown palette */}
      <style>{KEYBOARD_THEME_CSS}</style>

      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal — fullscreen on mobile, centered card on desktop */}
      <div
        className={cn(
          "relative w-full bg-white dark:bg-[#2a2a2a] shadow-2xl border-[#e8d4b8] dark:border-[#6b5a4a] animate-in fade-in zoom-in-95 duration-150 flex flex-col",
          "h-full sm:h-auto",
          "rounded-none sm:rounded-xl",
          "mx-0 sm:mx-4",
          "border-0 sm:border",
          "sm:max-w-lg"
        )}
        style={kbdHeight > 0 ? { paddingBottom: kbdHeight + 16 } : undefined}
        role="dialog"
        aria-modal="true"
        aria-labelledby="math-editor-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#e8d4b8]/40 dark:border-[#6b5a4a]/40">
          <h3 id="math-editor-title" className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            {isEditing ? "Edit Equation" : "Insert Equation"}
          </h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 sm:p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>

        {/* Mathfield */}
        <div className="px-4 pt-4 pb-2 flex-1 min-h-0">
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

        {/* Templates */}
        <div className="px-4 pb-2">
          <button
            type="button"
            onClick={() => setShowTemplates((s) => !s)}
            className="flex items-center gap-1 text-[11px] text-gray-400 dark:text-gray-500 hover:text-[#a0704b] dark:hover:text-[#c9a96e] transition-colors"
          >
            {showTemplates ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Templates
          </button>
          {showTemplates && (
            <div className="mt-2 grid grid-cols-2 gap-1 max-h-[180px] overflow-y-auto">
              {MATH_TEMPLATES.map((t) => (
                <button
                  key={t.label}
                  type="button"
                  onClick={() => {
                    const mf = mathfieldRef.current as any;
                    if (mf) {
                      mf.value = t.latex;
                      setLatex(t.latex);
                      mf.focus();
                    }
                  }}
                  className="text-left px-2 py-1.5 text-[11px] rounded-md hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] text-gray-600 dark:text-gray-400 transition-colors truncate"
                  title={t.latex}
                >
                  {t.label}
                </button>
              ))}
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
                className="px-3 py-2.5 sm:py-1.5 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
              >
                Delete
              </button>
            )}
            <button
              onClick={onClose}
              className="px-3 py-2.5 sm:py-1.5 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleInsert}
              disabled={!latex.trim()}
              className="px-4 py-2.5 sm:py-1.5 text-xs font-medium bg-[#a0704b] hover:bg-[#8b5f3c] text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
