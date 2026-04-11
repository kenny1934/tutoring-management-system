"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { X, Search, Loader2, Trash2, ZoomIn } from "lucide-react";
import dynamic from "next/dynamic";

const ImageLightbox = dynamic(() => import("@/components/inbox/ImageLightbox"), { ssr: false });
import { motion, AnimatePresence } from "framer-motion";
import { sessionsAPI } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/useIsMobile";
import { MobileBottomSheet } from "@/components/ui/mobile-bottom-sheet";
import { KEYBOARD_THEME_CSS } from "@/lib/mathlive-theme";
import { patchMathLiveMenu } from "@/lib/mathlive-utils";

interface WolframPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Convert LaTeX to Wolfram Alpha-compatible plain text */
function latexToWolfram(latex: string): string {
  let s = latex;
  // Fractions: \frac{a}{b} → (a)/(b)
  s = s.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1)/($2)');
  // Square roots: \sqrt{x} → sqrt(x), \sqrt[n]{x} → root(n, x)
  s = s.replace(/\\sqrt\[([^\]]+)\]\{([^}]+)\}/g, 'root($1, $2)');
  s = s.replace(/\\sqrt\{([^}]+)\}/g, 'sqrt($1)');
  // Integrals: \int_{a}^{b} → integrate from a to b
  s = s.replace(/\\int_\{([^}]+)\}\^\{([^}]+)\}/g, 'integrate from $1 to $2');
  s = s.replace(/\\int/g, 'integrate');
  // Limits: \lim_{x \to a} → limit as x -> a
  s = s.replace(/\\lim_\{([^}]+)\\to\s*([^}]+)\}/g, 'limit as $1 -> $2');
  // Sums: \sum_{i=a}^{b} → sum from i=a to b
  s = s.replace(/\\sum_\{([^}]+)\}\^\{([^}]+)\}/g, 'sum $1 to $2');
  // Superscripts: x^{2} → x^2
  s = s.replace(/\^\{([^}]+)\}/g, '^($1)');
  // Subscripts: x_{i} → x_i (mostly harmless)
  s = s.replace(/_\{([^}]+)\}/g, '_$1');
  // Trig functions
  s = s.replace(/\\(sin|cos|tan|cot|sec|csc|arcsin|arccos|arctan|ln|log|exp)/g, '$1');
  // Greek letters
  s = s.replace(/\\(alpha|beta|gamma|delta|theta|phi|pi|omega|sigma|lambda|mu)/g, '$1');
  // Infinity
  s = s.replace(/\\infty/g, 'infinity');
  // Times and cdot → *
  s = s.replace(/\\(times|cdot)/g, '*');
  // Plus/minus
  s = s.replace(/\\pm/g, '+-');
  // dx, dy spacing
  s = s.replace(/\\,/g, ' ');
  // Remove remaining backslashes for \left, \right, \operatorname, etc.
  s = s.replace(/\\(left|right|operatorname)/g, '');
  // Clean up braces
  s = s.replace(/[{}]/g, '');
  // Collapse whitespace
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

export function WolframPanel({ isOpen, onClose }: WolframPanelProps) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ image: string | null; error: string | null } | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [mathMode, setMathMode] = useState(false);
  const [mathliveLoaded, setMathliveLoaded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const mathfieldRef = useRef<HTMLElement | null>(null);
  const loadingRef = useRef(false);
  const isMobile = useIsMobile();

  // Focus input on open
  useEffect(() => {
    if (isOpen && !mathMode) {
      const t = setTimeout(() => inputRef.current?.focus(), 150);
      return () => clearTimeout(t);
    }
  }, [isOpen, mathMode]);

  // Lazy-load MathLive when math mode is first enabled
  useEffect(() => {
    if (!mathMode || mathliveLoaded) return;
    import("mathlive").then(() => setMathliveLoaded(true));
  }, [mathMode, mathliveLoaded]);

  // Inject keyboard theme CSS
  useEffect(() => {
    if (!mathliveLoaded) return;
    const id = "wolfram-mathlive-theme";
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = KEYBOARD_THEME_CSS;
    document.head.appendChild(style);
  }, [mathliveLoaded]);

  // Configure mathfield after it renders
  useEffect(() => {
    if (!mathMode || !mathliveLoaded) return;

    const timer = setTimeout(() => {
      const mf = mathfieldRef.current as any;
      if (!mf) return;
      mf.mathVirtualKeyboardPolicy = "manual";
      mf.addEventListener("input", () => {
        setQuery(latexToWolfram(mf.value || ""));
      });
      mf.focus();
      const kbd = (window as any).mathVirtualKeyboard;
      if (kbd) kbd.show({ animate: true });
    }, 150);

    const cleanupPatch = patchMathLiveMenu(mathfieldRef);

    return () => { clearTimeout(timer); cleanupPatch(); };
  }, [mathMode, mathliveLoaded]);

  const runQuery = useCallback(async (q: string) => {
    if (!q || loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setResult(null);
    try {
      const res = await sessionsAPI.wolframQuery(q);
      setResult(res);
      setHistory(prev => [q, ...prev.filter(h => h !== q)].slice(0, 10));
    } catch {
      setResult({ image: null, error: "Failed to reach server" });
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  const handleSubmit = useCallback(() => {
    runQuery(query.trim());
  }, [query, runQuery]);

  const handleHistoryClick = useCallback((q: string) => {
    setQuery(q);
    runQuery(q);
  }, [runQuery]);

  const toggleMathMode = useCallback(() => {
    setMathMode(prev => {
      if (prev) {
        // Switching back to text — hide virtual keyboard
        const kbd = (window as any).mathVirtualKeyboard;
        if (kbd) kbd.hide();
      }
      return !prev;
    });
  }, []);

  const panelContent = (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {/* Query input */}
      <form
        onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}
        className="flex flex-col gap-2 p-3 border-b border-[#d4c4a8] dark:border-[#3a3228]"
      >
        <div className="flex gap-2">
          {mathMode && mathliveLoaded ? (
            <div className="flex-1 min-w-0">
              {/* @ts-expect-error — math-field is a web component from MathLive */}
              <math-field
                ref={mathfieldRef}
                className={cn(
                  "w-full px-3 py-2 text-sm rounded-lg border",
                  "bg-white dark:bg-[#2a2318]",
                  "border-[#d4c4a8] dark:border-[#3a3228]",
                  "text-[#4a3728] dark:text-[#d4c4a8]",
                )}
                style={{ display: "block", minHeight: 38 }}
              />
            </div>
          ) : (
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. solve x^2 - 4x + 3 = 0"
              onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } }}
              className={cn(
                "flex-1 px-3 py-2 text-sm rounded-lg border",
                "bg-white dark:bg-[#2a2318]",
                "border-[#d4c4a8] dark:border-[#3a3228]",
                "text-[#4a3728] dark:text-[#d4c4a8]",
                "placeholder:text-[#b0a090] dark:placeholder:text-[#6b5d4d]",
                "focus:outline-none focus:ring-2 focus:ring-[#a0704b]/50"
              )}
            />
          )}
          <button
            type="button"
            onClick={toggleMathMode}
            className={cn(
              "px-2 py-2 rounded-lg text-xs font-mono transition-colors flex-shrink-0",
              mathMode
                ? "bg-[#a0704b] text-white"
                : "bg-[#e8dcc8] dark:bg-[#2a2318] text-[#6b4c30] dark:text-[#b0a090] hover:bg-[#d4c4a8] dark:hover:bg-[#3a3228]"
            )}
            title={mathMode ? "Switch to text input" : "Switch to math keyboard"}
          >
            f(x)
          </button>
          <button
            type="submit"
            disabled={!query.trim() || loading}
            className={cn(
              "px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              "bg-[#a0704b] text-white hover:bg-[#8b6040]",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </button>
        </div>
        {mathMode && query && (
          <div className="text-[10px] text-[#8b7355] dark:text-[#a09080] truncate" title={query}>
            Query: {query}
          </div>
        )}
      </form>

      {/* Query history chips */}
      {history.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-3 py-2 border-b border-[#d4c4a8] dark:border-[#3a3228]">
          {history.map((h) => (
            <button
              key={h}
              onClick={() => handleHistoryClick(h)}
              className={cn(
                "px-2 py-0.5 text-[11px] rounded-full truncate max-w-[180px]",
                "bg-[#e8dcc8] dark:bg-[#2a2318]",
                "text-[#6b4c30] dark:text-[#b0a090]",
                "hover:bg-[#d4c4a8] dark:hover:bg-[#3a3228]",
                "transition-colors"
              )}
              title={h}
            >
              {h}
            </button>
          ))}
          <button
            onClick={() => setHistory([])}
            className="p-0.5 text-[#b0a090] hover:text-[#6b4c30] dark:hover:text-[#d4c4a8] transition-colors"
            title="Clear history"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Result area */}
      <div className="flex-1 min-h-0 overflow-auto p-3">
        {loading && (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-[#b0a090]">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="text-xs">Computing...</span>
          </div>
        )}

        {!loading && result?.error && (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm text-[#8b7355] dark:text-[#a09080]">{result.error}</p>
          </div>
        )}

        {!loading && result?.image && (
          <button
            onClick={() => setLightboxOpen(true)}
            className="relative group cursor-zoom-in w-full"
          >
            <img
              src={`data:image/png;base64,${result.image}`}
              alt="Wolfram Alpha result"
              className="w-full rounded-lg dark:invert dark:hue-rotate-180"
            />
            <span className="absolute top-2 right-2 p-1 rounded bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity">
              <ZoomIn className="h-3.5 w-3.5" />
            </span>
          </button>
        )}

        {!loading && !result && (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-[#b0a090] dark:text-[#6b5d4d]">
            <p className="text-xs text-center">
              Type a math expression, equation, or question.
            </p>
            <div className="flex flex-wrap gap-1.5 justify-center mt-2">
              {["solve x^2-4x+3=0", "derivative of sin(x)cos(x)", "plot y=x^2", "integrate x^3 dx"].map(ex => (
                <button
                  key={ex}
                  onClick={() => { setQuery(ex); setTimeout(() => inputRef.current?.focus(), 0); }}
                  className="px-2 py-1 text-[10px] rounded bg-[#e8dcc8] dark:bg-[#2a2318] hover:bg-[#d4c4a8] dark:hover:bg-[#3a3228] text-[#8b7355] dark:text-[#a09080] transition-colors"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 px-3 py-2 border-t border-[#d4c4a8] dark:border-[#3a3228] space-y-1">
        <div className="flex items-center gap-1.5 text-[10px] text-amber-700 dark:text-amber-400">
          <span className="flex-shrink-0">&#9888;</span>
          <span>Shared quota: 100 queries/day, 2,000/month across all tutors. Use wisely.</span>
        </div>
        <div className="text-[10px] text-[#b0a090] dark:text-[#6b5d4d]">
          Powered by Wolfram|Alpha
        </div>
      </div>
    </div>
  );

  const lightbox = lightboxOpen && result?.image ? (
    <ImageLightbox
      images={[`data:image/png;base64,${result.image}`]}
      currentIndex={0}
      onClose={() => setLightboxOpen(false)}
      onChangeIndex={() => {}}
    />
  ) : null;

  // Mobile: bottom sheet
  if (isMobile) {
    return (
      <>
        <MobileBottomSheet
          isOpen={isOpen}
          onClose={onClose}
          title="Wolfram Alpha"
          className="bg-[#faf5ed] dark:bg-[#1e1a14]"
        >
          {panelContent}
        </MobileBottomSheet>
        {lightbox}
      </>
    );
  }

  // Desktop: right-side slide-in panel
  return (
    <>
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black z-[62]"
            onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className={cn(
              "fixed top-0 right-0 bottom-0 z-[63] w-[400px] max-w-[90vw]",
              "bg-[#faf5ed] dark:bg-[#1e1a14]",
              "border-l border-[#d4c4a8] dark:border-[#3a3228]",
              "shadow-2xl flex flex-col"
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#d4c4a8] dark:border-[#3a3228] bg-[#f0e6d4] dark:bg-[#252018]">
              <h3 className="text-sm font-semibold text-[#4a3728] dark:text-[#d4c4a8]">
                Wolfram Alpha
              </h3>
              <button
                onClick={onClose}
                className="p-1 rounded-lg hover:bg-[#d4c4a8] dark:hover:bg-[#3a3228] transition-colors"
                title="Close (Esc)"
              >
                <X className="h-4 w-4 text-[#8b7355] dark:text-[#a09080]" />
              </button>
            </div>

            {panelContent}
          </motion.div>
        </>
      )}
    </AnimatePresence>
    {lightbox}
    </>
  );
}
