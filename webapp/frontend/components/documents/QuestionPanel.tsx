"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import {
  X, Loader2, ListTree, RefreshCw, Sparkles, Copy, Check, RotateCw,
  Brain, Shuffle, ChevronDown, ChevronRight, FileOutput, BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { documentsAPI } from "@/lib/document-api";
import type { ExtractedQuestion, ProcessQuestionResult, ProcessQuestionError, ProcessQuestionsResponse, Document } from "@/types";
import katex from "katex";

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function MathText({ text }: { text: string }) {
  const html = useMemo(() => {
    // Split on $...$ math delimiters, escape non-math segments to prevent XSS
    const parts: string[] = [];
    let lastIndex = 0;
    const regex = /\$([^$]+)\$/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) parts.push(escapeHtml(text.slice(lastIndex, match.index)));
      try {
        parts.push(katex.renderToString(match[1], { throwOnError: false, output: "html" }));
      } catch {
        parts.push(`<code>${escapeHtml(match[1])}</code>`);
      }
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < text.length) parts.push(escapeHtml(text.slice(lastIndex)));
    return parts.join("");
  }, [text]);
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

const DIFFICULTY_COLORS = {
  easy: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  hard: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
} as const;

function extractNumber(label: string): { number: string; rest: string } {
  const m = label.match(/^(\d+[\.\)）]?\s*)/);
  if (m) return { number: m[1].trim(), rest: label.slice(m[0].length).trim() };
  return { number: label, rest: "" };
}

function getResultText(result: ProcessQuestionResult, field: "solution" | "variant" | "variant_solution"): string | null {
  if (field === "solution") return result.solution_text ?? null;
  if (field === "variant") return result.variant_text ?? null;
  return result.variant_solution_text ?? null;
}

function ResultPreview({ label, text }: { label: string; text: string | null }) {
  const [expanded, setExpanded] = useState(false);
  if (!text) return null;
  return (
    <div className="mt-1.5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-[10px] font-medium text-[#a0704b] dark:text-[#cd853f] hover:underline"
      >
        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        {label}
      </button>
      {expanded && (
        <div className="mt-1 pl-4 text-xs text-gray-600 dark:text-gray-400 leading-relaxed border-l-2 border-[#e8d4b8] dark:border-[#6b5a4a]">
          <MathText text={text} />
        </div>
      )}
    </div>
  );
}

function QuestionCard({
  q, result, errorMsg, retrying, onScrollToNode, onRetry,
}: {
  q: ExtractedQuestion;
  result?: ProcessQuestionResult;
  errorMsg?: string;
  retrying?: boolean;
  onScrollToNode: (i: number) => void;
  onRetry?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const { number, rest } = extractNumber(q.label);
  const fullText = [rest, q.preview].filter(Boolean).join(" ");
  const copyText = fullText || q.label;

  return (
    <div className="w-full text-left px-4 py-2.5 hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] transition-colors border-b border-gray-100 dark:border-gray-800/50 last:border-0">
      <div className="flex items-center gap-2 mb-1">
        <button
          onClick={() => onScrollToNode(q.start_node)}
          className="text-sm font-semibold text-gray-900 dark:text-gray-100 hover:text-[#a0704b] dark:hover:text-[#cd853f] transition-colors shrink-0"
        >
          {number}
        </button>
        {q.marks != null && (
          <span className="text-[10px] text-gray-400 dark:text-gray-500">{q.marks} marks</span>
        )}
        <div className="ml-auto flex items-center gap-0.5">
          {errorMsg && onRetry && (
            <button
              onClick={onRetry}
              disabled={retrying}
              className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors"
              title="Retry this question"
            >
              {retrying
                ? <Loader2 className="w-3 h-3 text-red-400 animate-spin" />
                : <RotateCw className="w-3 h-3 text-red-400" />}
            </button>
          )}
          <button
            className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors shrink-0"
            title="Copy question text (with LaTeX)"
            onClick={() => {
              navigator.clipboard.writeText(copyText);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3 text-gray-400" />}
          </button>
        </div>
      </div>
      {fullText && (
        <button
          onClick={() => onScrollToNode(q.start_node)}
          className="block text-xs text-gray-600 dark:text-gray-400 leading-relaxed mb-1 text-left line-clamp-3 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
        >
          <MathText text={fullText} />
        </button>
      )}
      {errorMsg && (
        <p className="text-[10px] text-red-500 mb-1">Failed: {errorMsg}</p>
      )}
      {(q.topic || q.difficulty) && (
        <div className="flex flex-wrap items-center gap-1">
          {q.topic && (
            <span className="px-1.5 py-0 rounded text-[10px] bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">
              {q.topic}
            </span>
          )}
          {q.subtopic && (
            <span className="px-1.5 py-0 rounded text-[10px] bg-gray-100 text-gray-500 dark:bg-white/5 dark:text-gray-400">
              {q.subtopic}
            </span>
          )}
          {q.difficulty && (
            <span className={cn("px-1.5 py-0 rounded text-[10px]", DIFFICULTY_COLORS[q.difficulty])}>
              {q.difficulty}
            </span>
          )}
        </div>
      )}
      {q.sub_questions && q.sub_questions.length > 0 && (
        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
          Sub-parts: {q.sub_questions.join(", ")}
        </p>
      )}

      {result && (
        <div className="mt-1">
          <ResultPreview label="Solution" text={getResultText(result, "solution")} />
          <ResultPreview label="Variant" text={getResultText(result, "variant")} />
          <ResultPreview label="Variant Solution" text={getResultText(result, "variant_solution")} />
        </div>
      )}
    </div>
  );
}

// Gemini 2.5 Flash pricing ($/1M tokens)
const GEMINI_PRICING = { input: 0.15, output: 0.60 };

function UsageSummary({ usage }: { usage: { input_tokens: number; output_tokens: number } }) {
  const cost = (usage.input_tokens * GEMINI_PRICING.input + usage.output_tokens * GEMINI_PRICING.output) / 1_000_000;
  return (
    <p className="text-[10px] text-gray-400 dark:text-gray-500 text-center">
      {usage.input_tokens.toLocaleString()} in / {usage.output_tokens.toLocaleString()} out &middot; ~${cost.toFixed(3)}
    </p>
  );
}

interface QuestionPanelProps {
  docId: number;
  doc: Document;
  isOpen: boolean;
  isReadOnly?: boolean;
  onClose: () => void;
  questions: ExtractedQuestion[] | null | undefined;
  onQuestionsUpdated: (questions: ExtractedQuestion[]) => void;
  onScrollToNode: (nodeIndex: number) => void;
  onContentRefresh?: (content: Record<string, unknown>) => void;
  /** Current top-level node count in the editor — used to detect stale extraction */
  editorNodeCount?: number;
  /** Whether the document already contains answer section nodes */
  hasAnswerSections?: boolean;
}

export function QuestionPanel({
  docId,
  doc,
  isOpen,
  isReadOnly = false,
  onClose,
  questions,
  onQuestionsUpdated,
  onScrollToNode,
  onContentRefresh,
  editorNodeCount,
  hasAnswerSections = false,
}: QuestionPanelProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState(false);
  const [processResults, setProcessResults] = useState<ProcessQuestionResult[] | null>(null);
  const [processErrors, setProcessErrors] = useState<ProcessQuestionError[]>([]);
  const [usage, setUsage] = useState<{ input_tokens: number; output_tokens: number } | null>(null);
  const [applying, setApplying] = useState(false);
  const [creating, setCreating] = useState(false);
  const [lastActions, setLastActions] = useState<string[]>(["solve"]);
  const [retryingIndex, setRetryingIndex] = useState<number | null>(null);
  const [successMsg, setSuccessMsg] = useState("");
  const [variantUrl, setVariantUrl] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"solve" | "vary" | null>(null);
  // Node count at extraction time — used to detect stale question list
  const [extractedNodeCount, setExtractedNodeCount] = useState<number | null>(null);
  const isStale = extractedNodeCount !== null && editorNodeCount !== undefined && editorNodeCount !== extractedNodeCount;

  // Hydrate results from stored solutions/variants on mount
  useEffect(() => {
    if (!questions || processResults) return;
    const solutions = doc.solutions;
    const variants = doc.variants;
    if (!solutions && !variants) return;

    const hydrated: ProcessQuestionResult[] = [];
    for (const q of questions) {
      const sol = solutions?.[String(q.index)];
      const vari = variants?.[String(q.index)];
      if (!sol && !vari) continue;
      hydrated.push({
        index: q.index,
        label: q.label,
        solution_text: sol?.text ?? null,
        variant_text: vari?.text ?? null,
        variant_solution_text: vari?.solution_text ?? null,
      });
    }
    if (hydrated.length > 0) setProcessResults(hydrated);
    // processResults intentionally excluded — one-time hydration, not re-run after processing
  }, [questions, doc.solutions, doc.variants]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleExtract = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await documentsAPI.extractQuestions(docId);
      onQuestionsUpdated(result.questions);
      setProcessResults(null);
      setProcessErrors([]);
      setUsage(null);
      setSuccessMsg("");
      setVariantUrl(null);
      if (editorNodeCount !== undefined) setExtractedNodeCount(editorNodeCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Extraction failed");
    } finally {
      setLoading(false);
    }
  }, [docId, onQuestionsUpdated, editorNodeCount]);

  const handleProcess = useCallback(async (actions: string[], questionIndices?: number[]) => {
    setProcessing(true);
    setError("");
    setLastActions(actions);
    try {
      const params: { actions: string[]; question_indices?: number[] } = { actions };
      if (questionIndices) params.question_indices = questionIndices;
      const result: ProcessQuestionsResponse = await documentsAPI.processQuestions(docId, params);

      if (questionIndices) {
        // Merge into existing results
        setProcessResults(prev => {
          const existing = prev ? [...prev] : [];
          const newMap = new Map(result.results.map(r => [r.index, r]));
          const merged = existing.map(r => newMap.get(r.index) ?? r);
          for (const r of result.results) {
            if (!existing.some(e => e.index === r.index)) merged.push(r);
          }
          return merged;
        });
        // Remove resolved errors
        const resolvedIndices = new Set(result.results.map(r => r.index));
        setProcessErrors(prev => [
          ...prev.filter(e => !resolvedIndices.has(e.index)),
          ...(result.errors ?? []),
        ]);
      } else {
        setProcessResults(result.results);
        setProcessErrors(result.errors ?? []);
      }

      setUsage(prev => {
        if (!prev) return result.usage;
        return {
          input_tokens: prev.input_tokens + result.usage.input_tokens,
          output_tokens: prev.output_tokens + result.usage.output_tokens,
        };
      });
      onQuestionsUpdated(result.questions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Processing failed");
    } finally {
      setProcessing(false);
      setRetryingIndex(null);
    }
  }, [docId, onQuestionsUpdated]);

  const handleRetry = useCallback((index: number) => {
    setRetryingIndex(index);
    handleProcess(lastActions, [index]);
  }, [handleProcess, lastActions]);

  const handleApplySolutions = useCallback(async () => {
    if (!processResults) return;
    setApplying(true);
    setError("");
    try {
      const updatedDoc = await documentsAPI.applySolutions(docId, { results: processResults, replace_existing: true });
      if (onContentRefresh && updatedDoc.content) {
        onContentRefresh(updatedDoc.content as Record<string, unknown>);
      }
      setSuccessMsg("Solutions applied to document");
      setTimeout(() => setSuccessMsg(""), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply solutions");
    } finally {
      setApplying(false);
    }
  }, [docId, processResults, onContentRefresh]);

  const handleCreateVariant = useCallback(async () => {
    if (!processResults) return;
    setCreating(true);
    setError("");
    try {
      const newDoc = await documentsAPI.createVariantDocument(docId, {
        results: processResults,
        include_solutions: true,
      });
      const url = `/documents/${newDoc.id}`;
      const win = window.open(url, "_blank");
      if (!win) {
        // Popup blocked — show a clickable link as fallback
        setVariantUrl(url);
      } else {
        setSuccessMsg("Variant document created");
        setTimeout(() => setSuccessMsg(""), 3000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create variant");
    } finally {
      setCreating(false);
    }
  }, [docId, processResults]);

  const resultMap = useMemo(() => {
    if (!processResults) return new Map<number, ProcessQuestionResult>();
    return new Map(processResults.map(r => [r.index, r]));
  }, [processResults]);

  const errorMap = useMemo(() => {
    return new Map(processErrors.map(e => [e.index, e.error]));
  }, [processErrors]);

  const hasVariants = useMemo(() => processResults?.some(r => r.variant_nodes != null || r.variant_text) ?? false, [processResults]);
  const hasSolutions = useMemo(() => processResults?.some(r => r.solution_nodes != null || r.solution_text) ?? false, [processResults]);

  const confirmMessage = useMemo(() => {
    if (!pendingAction) return "";
    const n = questions?.length ?? 0;
    const isVary = pendingAction === "vary";
    const skipSolve = isVary && hasSolutions;
    const inPerQ = 300;
    const outPerQ = isVary ? 800 : 400;
    const cost = n * (inPerQ * GEMINI_PRICING.input + outPerQ * GEMINI_PRICING.output) / 1_000_000;
    const costStr = cost < 0.01 ? "<$0.01" : `~$${cost.toFixed(2)}`;
    const base = skipSolve
      ? "Solutions already exist — only variants will be generated."
      : "This will use Gemini AI credits.";
    return `${base} Estimated cost: ${costStr}`;
  }, [pendingAction, hasSolutions, questions?.length]);

  const confirmConsequences = useMemo(() => {
    const c: string[] = [];
    if (pendingAction === "solve" && hasSolutions) c.push("Previous solve results will be overwritten");
    if (pendingAction === "vary" && hasVariants) c.push("Previous variant results will be overwritten");
    return c.length > 0 ? c : undefined;
  }, [pendingAction, hasSolutions, hasVariants]);

  if (!isOpen) return null;

  return (
    <div role="complementary" aria-label="Questions panel" className="w-80 border-l border-[#e8d4b8] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a] flex flex-col shrink-0 print:hidden max-md:fixed max-md:inset-0 max-md:w-full max-md:z-50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
        <div className="flex items-center gap-2">
          <ListTree className="w-4 h-4 text-[#a0704b]" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Questions</h3>
          {questions && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-gray-400">
              {questions.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {questions && questions.length > 0 && (
            <button
              onClick={handleExtract}
              disabled={loading || processing || isReadOnly}
              className="p-1.5 rounded hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title="Re-extract questions"
            >
              <RefreshCw className={cn("w-3.5 h-3.5 text-gray-500", loading && "animate-spin")} />
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="Close questions panel"
            className="p-1.5 rounded hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] transition-colors"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
      </div>

      {/* Banners */}
      {isStale && !loading && (
        <div className="px-3 py-1.5 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 text-[11px] text-amber-700 dark:text-amber-300 flex items-center justify-between">
          <span>Document changed — questions may be outdated</span>
          <button onClick={handleExtract} disabled={loading || processing} className="text-amber-600 dark:text-amber-400 hover:underline font-medium ml-2">Refresh</button>
        </div>
      )}
      {successMsg && (
        <div className="px-3 py-1.5 bg-green-50 dark:bg-green-900/20 border-b border-green-200 dark:border-green-800 text-[11px] text-green-700 dark:text-green-300">
          {successMsg}
        </div>
      )}
      {variantUrl && (
        <div className="px-3 py-1.5 bg-purple-50 dark:bg-purple-900/20 border-b border-purple-200 dark:border-purple-800 text-[11px] text-purple-700 dark:text-purple-300">
          Variant created — <a href={variantUrl} target="_blank" rel="noopener noreferrer" className="underline font-medium">open in new tab</a>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex flex-col items-center gap-3 py-12 text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin" />
            <p className="text-xs">Extracting questions...</p>
          </div>
        ) : processing && retryingIndex === null ? (
          <div className="flex flex-col items-center gap-3 py-12 text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin" />
            <p className="text-xs">Processing with AI...</p>
            <p className="text-[10px] text-gray-400/70">This may take a few seconds</p>
          </div>
        ) : !questions || questions.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-12 px-4">
            <Sparkles className="w-8 h-8 text-[#a0704b]/50" />
            <div className="text-center">
              <p className="text-sm text-gray-600 dark:text-gray-300">No questions extracted yet</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Parse the document to identify individual questions
              </p>
            </div>
            <button
              onClick={handleExtract}
              disabled={loading || isReadOnly}
              className="px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary-hover rounded-lg transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Extract Questions
            </button>
            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>
        ) : (
          <div className="py-2">
            {questions.map((q) => (
              <QuestionCard
                key={q.index}
                q={q}
                result={resultMap.get(q.index)}
                errorMsg={errorMap.get(q.index)}
                retrying={retryingIndex === q.index}
                onScrollToNode={onScrollToNode}
                onRetry={errorMap.has(q.index) ? () => handleRetry(q.index) : undefined}
              />
            ))}
            {error && <p className="text-xs text-red-500 px-4 py-2">{error}</p>}
            {usage && <div className="px-4 py-2"><UsageSummary usage={usage} /></div>}
          </div>
        )}
      </div>

      {/* Bottom toolbar */}
      {questions && questions.length > 0 && !loading && (!processing || retryingIndex !== null) && !isReadOnly && (
        <div className="border-t border-[#e8d4b8] dark:border-[#6b5a4a] px-3 py-2.5 space-y-2">
          <div className="flex gap-2">
            <button
              onClick={() => setPendingAction("solve")}
              disabled={processing}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/30 transition-colors"
            >
              <Brain className="w-3.5 h-3.5" />
              Solve ({questions.length})
            </button>
            <button
              onClick={() => setPendingAction("vary")}
              disabled={processing}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-purple-50 text-purple-700 hover:bg-purple-100 dark:bg-purple-900/20 dark:text-purple-300 dark:hover:bg-purple-900/30 transition-colors"
            >
              <Shuffle className="w-3.5 h-3.5" />
              Variants ({questions.length})
            </button>
          </div>

          {processResults && processResults.length > 0 && (
            <div className="flex gap-2">
              {hasSolutions && (
                <button
                  onClick={handleApplySolutions}
                  disabled={applying}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md text-white bg-primary hover:bg-primary-hover transition-colors"
                >
                  {applying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BookOpen className="w-3.5 h-3.5" />}
                  Apply Solutions
                </button>
              )}
              {hasVariants && (
                <button
                  onClick={handleCreateVariant}
                  disabled={creating}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700 transition-colors"
                >
                  {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileOutput className="w-3.5 h-3.5" />}
                  Create Variant
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        isOpen={pendingAction !== null}
        onConfirm={() => {
          const action = pendingAction;
          setPendingAction(null);
          if (action === "solve") handleProcess(["solve"]);
          else if (action === "vary") handleProcess(hasSolutions ? ["vary"] : ["solve", "vary"]);
        }}
        onCancel={() => setPendingAction(null)}
        title={pendingAction === "solve"
          ? `Solve ${questions?.length ?? 0} questions?`
          : `Generate variants for ${questions?.length ?? 0} questions?`}
        message={confirmMessage}
        consequences={confirmConsequences}
        confirmText={pendingAction === "solve" ? "Solve All" : "Generate Variants"}
      />
    </div>
  );
}
