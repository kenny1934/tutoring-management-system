"use client";
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { TextContent, TextItem } from 'pdfjs-dist/types/src/display/api';
import type { PageViewport } from 'pdfjs-dist/types/src/display/display_utils';
import { getPdfJs } from '@/lib/pdf-utils';
import { indexPdfText, type PdfTextIndex, type PdfTextMatch } from '@/lib/pdf-text-search';
import styles from './PdfTextSearch.module.css';
export type PdfNativeText = { content: TextContent; viewport: PageViewport; index: PdfTextIndex };
export function pdfNativeText(content: TextContent, viewport: PageViewport): PdfNativeText {
  return { content, viewport, index: indexPdfText(content.items.filter((item): item is TextItem => 'str' in item)) };
}
type Rect = { left: number; top: number; width: number; height: number };
function mergeRects(rects: Rect[], vertical: boolean): Rect[] {
  const result: Rect[] = [];
  for (const rect of rects) {
    const last = result.at(-1);
    const tolerance = last ? Math.max(2, Math.min(vertical ? last.width : last.height, vertical ? rect.width : rect.height) * .4) : 2;
    const aligned = last && (vertical
      ? Math.abs(last.left - rect.left) < 2 && Math.abs(last.width - rect.width) < 2 && rect.top <= last.top + last.height + tolerance && last.top <= rect.top + rect.height + tolerance
      : Math.abs(last.top - rect.top) < 2 && Math.abs(last.height - rect.height) < 2 && rect.left <= last.left + last.width + tolerance && last.left <= rect.left + rect.width + tolerance);
    if (!last || !aligned) { result.push(rect); continue; }
    const right = Math.max(last.left + last.width, rect.left + rect.width), bottom = Math.max(last.top + last.height, rect.top + rect.height);
    last.left = Math.min(last.left, rect.left); last.top = Math.min(last.top, rect.top);
    last.width = right - last.left; last.height = bottom - last.top;
  }
  return result;
}

export function PdfTextSearchLayer({ page, matches, active, onActiveReady, onUnavailable, dark = false }: { page: PdfNativeText; matches: PdfTextMatch[]; active: number; onActiveReady: (element: HTMLElement) => void; onUnavailable?: () => void; dark?: boolean }) {
  const root = useRef<HTMLDivElement>(null), layerRoot = useRef<HTMLDivElement>(null);
  const [rectangles, setRectangles] = useState<Rect[][]>([]);
  const ready = useRef(onActiveReady); ready.current = onActiveReady;
  const unavailable = useRef(onUnavailable); unavailable.current = onUnavailable;
  const [failed, setFailed] = useState(false);
  const [measured, setMeasured] = useState(false);
  useEffect(() => {
    const container = layerRoot.current, host = root.current;
    if (!container || !host) return;
    setFailed(false); setMeasured(false);
    let cancelled = false;
    let cancelLayer: (() => void) | undefined;
    void (async () => {
      const { TextLayer } = await getPdfJs();
      if (cancelled) return;
      const layer = new TextLayer({ textContentSource: page.content, container, viewport: page.viewport });
      cancelLayer = () => layer.cancel();
      await layer.render();
      if (cancelled) return;
      const box = host.getBoundingClientRect();
      const scaleX = box.width / host.offsetWidth, scaleY = box.height / host.offsetHeight;
      if (!scaleX || !scaleY) { setFailed(true); return; }
      const result = matches.map(match => page.index.runs.flatMap(run => {
        if (run.end <= match.start || run.start >= match.end) return [];
        const text = layer.textDivs[run.item]?.firstChild;
        if (!text) return [];
        const range = document.createRange();
        range.setStart(text, Math.max(0, match.start - run.start));
        range.setEnd(text, Math.min(run.end - run.start, match.end - run.start));
        return [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0).map(rect => ({ left: (rect.left - box.left) / scaleX, top: (rect.top - box.top) / scaleY, width: rect.width / scaleX, height: rect.height / scaleY }));
      }));
      setRectangles(result.map(rects => mergeRects(rects, page.viewport.rotation % 180 !== 0))); setMeasured(true);
    })().catch(() => { if (!cancelled) { setRectangles([]); setFailed(true); } });
    return () => { cancelled = true; cancelLayer?.(); container.replaceChildren(); };
  }, [page, matches]);
  useEffect(() => {
    const selected = root.current?.querySelector<HTMLElement>('[data-pdf-active-match] mark');
    if (selected) ready.current(selected);
    else if (active >= 0 && (failed || measured)) unavailable.current?.();
  }, [active, rectangles, failed, measured]);
  return <div ref={root} className={styles.overlay} data-dark-pdf={dark || undefined} aria-hidden="true">
    <div ref={layerRoot} className={styles.textLayer} style={{ '--total-scale-factor': page.viewport.scale, '--scale-round-x': '1px', '--scale-round-y': '1px' } as CSSProperties} />
    {rectangles.map((rects, index) => <div key={index} data-pdf-match={index} data-pdf-active-match={index === active ? '' : undefined}>{rects.map((rect, part) => <mark key={part} className={`${styles.highlight} ${index === active ? styles.active : ''}`} style={rect} />)}</div>)}
  </div>;
}
