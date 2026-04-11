"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { X, Search, Loader2, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { sessionsAPI } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/useIsMobile";
import { MobileBottomSheet } from "@/components/ui/mobile-bottom-sheet";

interface WolframPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WolframPanel({ isOpen, onClose }: WolframPanelProps) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ image: string | null; error: string | null } | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const loadingRef = useRef(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => inputRef.current?.focus(), 150);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

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

  const panelContent = (
    <div className="flex flex-col h-full">
      {/* Query input */}
      <form
        onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}
        className="flex gap-2 p-3 border-b border-[#d4c4a8] dark:border-[#3a3228]"
      >
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
      <div className="flex-1 overflow-auto p-3">
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
          <img
            src={`data:image/png;base64,${result.image}`}
            alt="Wolfram Alpha result"
            className="w-full rounded-lg dark:invert dark:hue-rotate-180"
          />
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
      <div className="px-3 py-2 border-t border-[#d4c4a8] dark:border-[#3a3228] text-[10px] text-[#b0a090] dark:text-[#6b5d4d]">
        Powered by Wolfram|Alpha
      </div>
    </div>
  );

  // Mobile: bottom sheet
  if (isMobile) {
    return (
      <MobileBottomSheet
        isOpen={isOpen}
        onClose={onClose}
        title="Wolfram Alpha"
        className="bg-[#faf5ed] dark:bg-[#1e1a14]"
      >
        {panelContent}
      </MobileBottomSheet>
    );
  }

  // Desktop: right-side slide-in panel
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black z-[62]"
            onClick={onClose}
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
  );
}
