"use client";

import { useEffect, useState } from "react";
import type { PDFDocumentLoadingTask, RenderTask } from "pdfjs-dist";
import { getPdfJs } from "@/lib/pdf-utils";

/** Only the already-open local blob is rendered. Browsing a folder never fetches its PDFs. */
export function usePdfCover(url: string | null, fileKey: string | null = url) {
  const [cover, setCover] = useState<{ url: string; source: string; image: string } | null>(null);
  useEffect(() => {
    if (!url?.startsWith("blob:") || !fileKey) return;
    let cancelled = false;
    let loading: PDFDocumentLoadingTask | undefined, render: RenderTask | undefined;
    void (async () => {
      try {
        const pdfjs = await getPdfJs();
        if (cancelled) return;
        loading = pdfjs.getDocument(url);
        const pdf = await loading.promise;
        const page = await pdf.getPage(1);
        if (cancelled) return;
        const viewport = page.getViewport({ scale: 240 / page.getViewport({ scale: 1 }).width });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext("2d");
        if (!context) return;
        render = page.render({ canvasContext: context, canvas, viewport });
        await render.promise;
        if (!cancelled) setCover({ url, source: fileKey, image: canvas.toDataURL("image/webp", .75) });
      } catch { /* The full reader retains its existing error handling; the tile keeps its file icon. */ }
      finally { await loading?.destroy().catch(() => {}); }
    })();
    return () => { cancelled = true; render?.cancel(); void loading?.destroy().catch(() => {}); };
  }, [url, fileKey]);
  return !url || cover?.url === url ? cover : null;
}
