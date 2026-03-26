"use client";

import { useState, useCallback, useMemo } from "react";
import { X, Loader2, ListTree, RefreshCw, Sparkles, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { documentsAPI } from "@/lib/document-api";
import type { ExtractedQuestion } from "@/types";
import katex from "katex";

function MathText({ text }: { text: string }) {
  const html = useMemo(() => {
    return text.replace(/\$([^$]+)\$/g, (_, latex: string) => {
      try {
        return katex.renderToString(latex, { throwOnError: false, output: "html" });
      } catch {
        return `<code>${latex}</code>`;
      }
    });
  }, [text]);
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

const DIFFICULTY_COLORS = {
  easy: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  hard: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
} as const;

/** Extract just the question number from a label like "5. 已知角α的終邊過點..." → "5." */
function extractNumber(label: string): { number: string; rest: string } {
  const m = label.match(/^(\d+[\.\)）]?\s*)/);
  if (m) return { number: m[1].trim(), rest: label.slice(m[0].length).trim() };
  return { number: label, rest: "" };
}

function QuestionCard({ q, onScrollToNode }: { q: ExtractedQuestion; onScrollToNode: (i: number) => void }) {
  const [copied, setCopied] = useState(false);
  const { number, rest } = extractNumber(q.label);
  // rest = heading text minus number, preview = body nodes text
  // Show both when they exist (heading has question, body has options)
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
        <button
          className="ml-auto p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors shrink-0"
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
      {fullText && (
        <button
          onClick={() => onScrollToNode(q.start_node)}
          className="block text-xs text-gray-600 dark:text-gray-400 leading-relaxed mb-1 text-left line-clamp-3 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
        >
          <MathText text={fullText} />
        </button>
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
    </div>
  );
}

interface QuestionPanelProps {
  docId: number;
  isOpen: boolean;
  onClose: () => void;
  questions: ExtractedQuestion[] | null | undefined;
  onQuestionsUpdated: (questions: ExtractedQuestion[]) => void;
  onScrollToNode: (nodeIndex: number) => void;
}

export function QuestionPanel({
  docId,
  isOpen,
  onClose,
  questions,
  onQuestionsUpdated,
  onScrollToNode,
}: QuestionPanelProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleExtract = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await documentsAPI.extractQuestions(docId);
      onQuestionsUpdated(result.questions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Extraction failed");
    } finally {
      setLoading(false);
    }
  }, [docId, onQuestionsUpdated]);

  if (!isOpen) return null;

  return (
    <div className="w-80 border-l border-[#e8d4b8] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a] flex flex-col shrink-0 print:hidden">
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
              disabled={loading}
              className="p-1.5 rounded hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] transition-colors"
              title="Re-extract questions"
            >
              <RefreshCw className={cn("w-3.5 h-3.5 text-gray-500", loading && "animate-spin")} />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-[#f5ede3] dark:hover:bg-[#2d2618] transition-colors"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex flex-col items-center gap-3 py-12 text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin" />
            <p className="text-xs">Extracting questions...</p>
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
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary-hover rounded-lg transition-colors shadow-sm"
            >
              Extract Questions
            </button>
            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>
        ) : (
          <div className="py-2">
            {questions.map((q) => (
              <QuestionCard key={q.index} q={q} onScrollToNode={onScrollToNode} />
            ))}
            {error && <p className="text-xs text-red-500 px-4 py-2">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
