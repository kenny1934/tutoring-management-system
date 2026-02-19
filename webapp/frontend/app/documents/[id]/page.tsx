"use client";

import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { Loader2 } from "lucide-react";
import { documentsAPI } from "@/lib/document-api";
import { usePageTitle } from "@/lib/hooks";
import { DocumentEditor } from "@/components/documents/DocumentEditor";

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
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-6 h-6 animate-spin text-[#a0704b]" />
      </div>
    );
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
