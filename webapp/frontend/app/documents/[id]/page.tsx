"use client";

import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { documentsAPI } from "@/lib/document-api";
import { usePageTitle } from "@/lib/hooks";
import { DocumentEditor } from "@/components/documents/DocumentEditor";

function EditorSkeleton() {
  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Top bar skeleton */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-[#e8d4b8] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a]">
        <div className="h-7 w-7 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-5 w-48 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="flex-1" />
        <div className="h-5 w-14 rounded bg-gray-100 dark:bg-gray-800" />
        <div className="h-8 w-20 rounded-lg bg-gray-200 dark:bg-gray-700" />
        <div className="h-8 w-20 rounded-lg bg-gray-200 dark:bg-gray-700" />
      </div>
      {/* Toolbar skeleton */}
      <div className="border-b border-[#e8d4b8] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a]">
        <div className="flex items-center gap-1 px-3 py-1.5 border-b border-[#e8d4b8]/40 dark:border-[#6b5a4a]/40">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-6 w-6 rounded bg-gray-100 dark:bg-gray-800" />
          ))}
          <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1" />
          <div className="h-6 w-16 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="h-6 w-14 rounded bg-gray-100 dark:bg-gray-800" />
        </div>
        <div className="flex items-center gap-1 px-3 py-1.5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-6 w-6 rounded bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
      </div>
      {/* Editor area skeleton */}
      <div className="flex-1 bg-[#f0e8dc] dark:bg-[#0d0d0d] overflow-hidden">
        <div className="py-8 px-4">
          <div className="relative mx-auto bg-white dark:bg-[#2a2420] shadow-lg ring-1 ring-inset ring-gray-200 dark:ring-[#4a3a2a] overflow-hidden" style={{ width: "210mm", minHeight: "297mm", padding: "25.4mm" }}>
            {([
              "w-1/3", "w-full", "w-full", "w-4/5", "", "w-2/3", "w-full", "w-full", "w-3/4", "", "w-1/2", "w-full", "w-5/6",
            ] as const).map((w, i) =>
              w === "" ? (
                <div key={i} className="h-5" />
              ) : (
                <div key={i} className={`h-3.5 rounded bg-gray-100 dark:bg-gray-800 mb-2.5 ${w}`} />
              )
            )}
            <div className="absolute inset-0 skeleton-shimmer" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DocumentEditorPage() {
  const params = useParams();
  const router = useRouter();
  const docId = Number(params.id);

  const { data: doc, isLoading, error, mutate } = useSWR(
    docId ? ["document", docId] : null,
    () => documentsAPI.get(docId),
    { revalidateOnFocus: false }
  );

  usePageTitle(doc?.title ?? "Document");

  if (isLoading) {
    return <EditorSkeleton />;
  }

  if (error || !doc) {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-muted-foreground">
        <p className="text-lg font-medium">
          {error?.message?.includes("not found") ? "Document not found" : "Error loading document"}
        </p>
        {error && !error.message?.includes("not found") && (
          <p className="text-sm mt-1">{error.message}</p>
        )}
        <button
          onClick={() => router.push("/documents")}
          className="mt-3 text-sm text-[#a0704b] dark:text-[#cd853f] hover:underline"
        >
          Back to Documents
        </button>
      </div>
    );
  }

  return (
    <DocumentEditor
      document={doc}
      onUpdate={mutate}
    />
  );
}
