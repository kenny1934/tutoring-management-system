"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { X, Search, Loader2, Trash2, ZoomIn, Clock, Zap } from "lucide-react";
import ImageLightbox from "@/components/inbox/ImageLightbox";
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

/** Convert LaTeX to Wolfram Alpha-compatible plain text.
 *  Brace groups use a pattern that handles one level of nesting (e.g. \frac{x^{2}+1}{x-3}). */
const B = '([^{}]*(?:\\{[^{}]*\\}[^{}]*)*)'; // one-level brace content capture group

function latexToWolfram(latex: string): string {
  let s = latex;
  s = s.replace(new RegExp(`\\\\frac\\{${B}\\}\\{${B}\\}`, 'g'), '($1)/($2)');
  s = s.replace(new RegExp(`\\\\sqrt\\[([^\\]]+)\\]\\{${B}\\}`, 'g'), 'root($1, $2)');
  s = s.replace(new RegExp(`\\\\sqrt\\{${B}\\}`, 'g'), 'sqrt($1)');
  s = s.replace(new RegExp(`\\\\int_\\{${B}\\}\\^\\{${B}\\}`, 'g'), 'integrate from $1 to $2');
  s = s.replace(/\\int/g, 'integrate');
  s = s.replace(new RegExp(`\\\\lim_\\{${B}\\\\to\\s*${B}\\}`, 'g'), 'limit as $1 -> $2');
  s = s.replace(new RegExp(`\\\\sum_\\{${B}\\}\\^\\{${B}\\}`, 'g'), 'sum $1 to $2');
  s = s.replace(new RegExp(`\\^\\{${B}\\}`, 'g'), '^($1)');
  s = s.replace(new RegExp(`_\\{${B}\\}`, 'g'), '_$1');
  s = s.replace(/\\(sin|cos|tan|cot|sec|csc|arcsin|arccos|arctan|ln|log|exp)/g, '$1');
  s = s.replace(/\\(alpha|beta|gamma|delta|theta|phi|pi|omega|sigma|lambda|mu)/g, '$1');
  s = s.replace(/\\infty/g, 'infinity');
  s = s.replace(/\\(times|cdot)/g, '*');
  s = s.replace(/\\pm/g, '+-');
  s = s.replace(/\\,/g, ' ');
  s = s.replace(/\\(left|right|operatorname)/g, '');
  s = s.replace(/[{}]/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

const HISTORY_KEY = "wolfram-query-history";
const MAX_HISTORY = 30;

function loadHistory(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, MAX_HISTORY) : [];
  } catch { return []; }
}

function saveHistory(history: string[]) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY))); } catch {}
}

export function WolframPanel({ isOpen, onClose }: WolframPanelProps) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ image: string | null; error: string | null; cached?: boolean } | null>(null);
  const [history, setHistory] = useState<string[]>(() => loadHistory());
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [mathMode, setMathMode] = useState(false);
  const [mathliveLoaded, setMathliveLoaded] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const mathfieldRef = useRef<HTMLElement | null>(null);
  const loadingRef = useRef(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (isOpen && !mathMode) {
      const t = setTimeout(() => inputRef.current?.focus(), 150);
      return () => clearTimeout(t);
    }
  }, [isOpen, mathMode]);

  useEffect(() => {
    if (!mathMode || mathliveLoaded) return;
    import("mathlive").then(() => setMathliveLoaded(true));
  }, [mathMode, mathliveLoaded]);

  const inputHandlerRef = useRef<{ mf: any; handler: () => void } | null>(null);
  useEffect(() => {
    if (!mathMode || !mathliveLoaded) return;

    const timer = setTimeout(() => {
      const mf = mathfieldRef.current as any;
      if (!mf) return;
      mf.mathVirtualKeyboardPolicy = "manual";
      const handler = () => setQuery(latexToWolfram(mf.value || ""));
      mf.addEventListener("input", handler);
      inputHandlerRef.current = { mf, handler };
      mf.focus();
      const kbd = (window as any).mathVirtualKeyboard;
      if (kbd) kbd.show({ animate: true });
    }, 150);

    const cleanupPatch = patchMathLiveMenu(mathfieldRef);

    return () => {
      clearTimeout(timer);
      cleanupPatch();
      if (inputHandlerRef.current) {
        inputHandlerRef.current.mf.removeEventListener("input", inputHandlerRef.current.handler);
        inputHandlerRef.current = null;
      }
    };
  }, [mathMode, mathliveLoaded]);

  const runQuery = useCallback(async (q: string) => {
    if (!q || loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setResult(null);
    setShowHistory(false);
    try {
      const res = await sessionsAPI.wolframQuery(q);
      setResult(res);
      setHistory(prev => {
        const next = [q, ...prev.filter(h => h !== q)].slice(0, MAX_HISTORY);
        // Save outside updater via microtask to avoid side effect in setState
        queueMicrotask(() => saveHistory(next));
        return next;
      });
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
    setShowHistory(false);
    runQuery(q);
  }, [runQuery]);

  const clearHistory = useCallback(() => {
    setHistory([]);
    saveHistory([]);
  }, []);

  const toggleMathMode = useCallback(() => {
    setMathMode(prev => {
      if (prev) {
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
              <style>{KEYBOARD_THEME_CSS}</style>
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

      {/* History toggle bar */}
      {history.length > 0 && (
        <button
          onClick={() => setShowHistory(v => !v)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 text-[11px] transition-colors border-b",
            "border-[#d4c4a8] dark:border-[#3a3228]",
            showHistory
              ? "bg-[#e8dcc8] dark:bg-[#2a2318] text-[#6b4c30] dark:text-[#b0a090]"
              : "text-[#8b7355] dark:text-[#a09080] hover:bg-[#f0e6d4] dark:hover:bg-[#252018]"
          )}
        >
          <Clock className="h-3 w-3" />
          <span>History ({history.length})</span>
        </button>
      )}

      {/* History list */}
      <AnimatePresence>
        {showHistory && history.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden border-b border-[#d4c4a8] dark:border-[#3a3228]"
          >
            <div className="max-h-48 overflow-auto">
              {history.map((h, i) => (
                <button
                  key={`${h}-${i}`}
                  onClick={() => handleHistoryClick(h)}
                  className={cn(
                    "w-full text-left px-3 py-1.5 text-xs truncate transition-colors",
                    "text-[#4a3728] dark:text-[#d4c4a8]",
                    "hover:bg-[#e8dcc8] dark:hover:bg-[#2a2318]"
                  )}
                  title={h}
                >
                  {h}
                </button>
              ))}
            </div>
            <div className="flex justify-end px-3 py-1">
              <button
                onClick={clearHistory}
                className="flex items-center gap-1 text-[10px] text-[#b0a090] hover:text-[#6b4c30] dark:hover:text-[#d4c4a8] transition-colors"
              >
                <Trash2 className="h-2.5 w-2.5" /> Clear all
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
          <>
            {result.cached && (
              <div className="flex items-center gap-1 mb-2 text-[10px] text-emerald-600 dark:text-emerald-400">
                <Zap className="h-3 w-3" />
                <span>Cached result (no quota used)</span>
              </div>
            )}
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
          </>
        )}

        {!loading && !result && !showHistory && (
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
