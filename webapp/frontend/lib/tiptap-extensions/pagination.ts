import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { EditorView } from "@tiptap/pm/view";
import type { DocumentMetadata } from "@/types";
import {
  measureNodeHeights,
  calculateBreakPositions,
  createPageBreakElement,
  estimateHFHeightPx,
  type PaginationConfig,
  type PageBreakInfo,
  type PaginationResult,
} from "./pagination-utils";

// ─── Plugin key ──────────────────────────────────────────────────────
export const paginationPluginKey = new PluginKey("pagination");

// ─── Extension options ──────────────────────────────────────────────
export interface PaginationOptions {
  metadata: DocumentMetadata | null;
  docTitle: string;
}

// ─── TipTap Extension ───────────────────────────────────────────────
export const PaginationExtension = Extension.create<PaginationOptions>({
  name: "pagination",

  addOptions() {
    return {
      metadata: null,
      docTitle: "",
    };
  },

  addProseMirrorPlugins() {
    const extensionThis = this;

    const plugin = new Plugin({
      key: paginationPluginKey,

      state: {
        init() {
          return {
            decorationSet: DecorationSet.empty,
            breaks: [] as PageBreakInfo[],
            lastPageRemainingPx: 0,
            metadata: extensionThis.options.metadata as DocumentMetadata | null,
            docTitle: extensionThis.options.docTitle as string,
            needsRecalc: true, // initial calculation needed
          };
        },

        apply(tr, value, _oldState, _newState) {
          const meta = tr.getMeta(paginationPluginKey);

          // Case 1: Decoration update from recalculate() — store results, clear needsRecalc
          if (meta?.__decorationUpdate) {
            return {
              decorationSet: meta.decorationSet as DecorationSet,
              breaks: meta.breaks as PageBreakInfo[],
              lastPageRemainingPx: meta.lastPageRemainingPx as number,
              metadata: value.metadata,
              docTitle: value.docTitle,
              needsRecalc: false,
            };
          }

          // Case 2: Force recalc (e.g. image loaded in content area)
          if (meta?.__forceRecalc) {
            return { ...value, needsRecalc: true };
          }

          // Case 3: External metadata/title update
          const metadata = meta?.metadata !== undefined ? meta.metadata : value.metadata;
          const docTitle = meta?.docTitle !== undefined ? meta.docTitle : value.docTitle;
          const metaChanged = meta?.metadata !== undefined || meta?.docTitle !== undefined;

          // Case 4: Document changed or metadata changed — mark for recalc
          if (tr.docChanged || metaChanged) {
            return {
              decorationSet: tr.docChanged
                ? value.decorationSet.map(tr.mapping, tr.doc)
                : value.decorationSet,
              breaks: value.breaks,
              lastPageRemainingPx: value.lastPageRemainingPx,
              metadata,
              docTitle,
              needsRecalc: true,
            };
          }

          // No changes relevant to pagination
          return value;
        },
      },

      view(editorView) {
        let debounceTimer: ReturnType<typeof setTimeout> | null = null;
        let isRecalculating = false;
        let recalcCooldown = false;

        const recalculate = (view: EditorView) => {
          if (isRecalculating) return;
          isRecalculating = true;

          try {
            const pluginState = paginationPluginKey.getState(view.state);
            if (!pluginState) return;

            const { metadata, docTitle } = pluginState;

            // Save scroll position BEFORE measurement. The pagination-measuring
            // class hides decorations (display:none), collapsing the DOM height.
            // getBoundingClientRect forces a layout reflow during which the browser
            // may clamp scrollTop to the shorter document. We restore it after.
            const scrollEl = view.dom.closest('.document-page-scroll-container') as HTMLElement | null;
            const savedScrollTop = scrollEl?.scrollTop ?? 0;

            // Temporarily reset CSS zoom to 1 so all DOM measurements
            // (getBoundingClientRect, offsetHeight) are in true CSS pixels.
            const pageEl = view.dom.closest(".document-page") as HTMLElement | null;
            const savedZoom = pageEl?.style.zoom ?? "";
            if (pageEl) pageEl.style.zoom = "1";

            // Measure block heights (toggles pagination-measuring class)
            const blocks = measureNodeHeights(view);

            // Measure actual rendered header/footer heights from the DOM
            const firstPageHeader = pageEl?.querySelector(".first-page-header");
            const lastPageFooter = pageEl?.querySelector(".last-page-footer .page-footer-content");
            const actualHeaderPx = firstPageHeader instanceof HTMLElement ? firstPageHeader.offsetHeight : estimateHFHeightPx(metadata?.header);
            const actualFooterPx = lastPageFooter instanceof HTMLElement ? lastPageFooter.offsetHeight : estimateHFHeightPx(metadata?.footer);

            // Restore zoom
            if (pageEl) pageEl.style.zoom = savedZoom;

            // Restore scroll position after measurement (before calculations/dispatch)
            if (scrollEl) scrollEl.scrollTop = savedScrollTop;

            const config: PaginationConfig = {
              margins: {
                top: metadata?.margins?.top ?? 25.4,
                right: metadata?.margins?.right ?? 25.4,
                bottom: metadata?.margins?.bottom ?? 25.4,
                left: metadata?.margins?.left ?? 25.4,
              },
              headerHeightPx: actualHeaderPx,
              footerHeightPx: actualFooterPx,
            };

            const result = calculateBreakPositions(blocks, config);

            // Compare with previous breaks to minimize unnecessary work
            const oldBreaks = pluginState.breaks;
            const breaksChanged = result.breaks.length !== oldBreaks.length
              || result.breaks.some((b, i) => b.pos !== oldBreaks[i].pos);

            if (!breaksChanged) {
              // Breaks unchanged — dispatch spacer update (reuse existing decorations).
              // This keeps lastPageRemainingPx current for the LastPageFooter spacer,
              // and clears needsRecalc to stop continuous re-scheduling.
              const tr = view.state.tr.setMeta(paginationPluginKey, {
                __decorationUpdate: true,
                breaks: result.breaks,
                lastPageRemainingPx: result.lastPageRemainingPx,
                decorationSet: pluginState.decorationSet, // reuse — no DOM churn
              });
              tr.setMeta("addToHistory", false);
              view.dispatch(tr);
              return;
            }

            // Breaks changed — full decoration recreation
            // Create Widget Decorations
            // Include header/footer metadata in key so ProseMirror replaces DOM on metadata changes
            const hfKey = JSON.stringify({ h: metadata?.header, f: metadata?.footer, t: docTitle });
            const totalPages = result.breaks.length + 1;
            const decorations: Decoration[] = result.breaks.map((brk) => {
              const element = createPageBreakElement({
                remainingPx: brk.remainingPx,
                pageNumber: brk.pageNumber,
                nextPageNumber: brk.pageNumber + 1,
                totalPages,
                docTitle: docTitle || "",
                metadata,
                isExplicitBreak: brk.isExplicitBreak,
              });

              return Decoration.widget(brk.pos, element, {
                side: -1,
                key: `pb-${brk.pos}-${brk.pageNumber}-${hfKey}`,
              });
            });

            const decorationSet = DecorationSet.create(view.state.doc, decorations);

            // Dispatch transaction with updated decorations
            const tr = view.state.tr.setMeta(paginationPluginKey, {
              __decorationUpdate: true,
              breaks: result.breaks,
              lastPageRemainingPx: result.lastPageRemainingPx,
              decorationSet,
            });
            tr.setMeta("addToHistory", false);
            // Only scroll to cursor when break positions change (new page created/removed).
            // When only the spacer height changed, keep viewport stable.
            if (breaksChanged) tr.scrollIntoView();
            view.dispatch(tr);

            // Cooldown: ignore ResizeObserver events caused by our own decoration changes
            recalcCooldown = true;
            setTimeout(() => { recalcCooldown = false; }, 500);
          } finally {
            isRecalculating = false;
          }
        };

        const scheduleRecalc = (view: EditorView) => {
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => recalculate(view), 250);
        };

        // ResizeObserver: detect external layout changes (font loading, CSS changes)
        // that don't trigger docChanged or metadata updates. The cooldown prevents
        // infinite loops from our own decoration changes resizing the editor.
        const resizeObserver = new ResizeObserver(() => {
          if (isRecalculating || recalcCooldown) return;
          scheduleRecalc(editorView);
        });
        resizeObserver.observe(editorView.dom);

        return {
          update(view) {
            // Don't re-trigger during our own decoration update
            if (isRecalculating) return;

            const pluginState = paginationPluginKey.getState(view.state);
            if (!pluginState?.needsRecalc) return;

            scheduleRecalc(view);
          },

          destroy() {
            if (debounceTimer) clearTimeout(debounceTimer);
            resizeObserver.disconnect();
          },
        };
      },

      props: {
        decorations(state) {
          const pluginState = paginationPluginKey.getState(state);
          return pluginState?.decorationSet ?? DecorationSet.empty;
        },
      },
    });

    return [plugin];
  },
});
