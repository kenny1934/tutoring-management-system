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
              metadata,
              docTitle,
              needsRecalc: true,
            };
          }

          // No changes relevant to pagination
          return value;
        },
      },

      view() {
        let debounceTimer: ReturnType<typeof setTimeout> | null = null;
        let isRecalculating = false;

        const recalculate = (view: EditorView) => {
          if (isRecalculating) return;
          isRecalculating = true;

          try {
            const pluginState = paginationPluginKey.getState(view.state);
            if (!pluginState) return;

            const { metadata, docTitle } = pluginState;

            // Measure block heights (toggles pagination-measuring class)
            const blocks = measureNodeHeights(view);

            // Measure actual rendered header/footer heights from the DOM
            // The React first-page header is a sibling before the editor in the document-page
            const pageEl = view.dom.closest(".document-page");
            const firstPageHeader = pageEl?.querySelector(".first-page-header");
            const lastPageFooter = pageEl?.querySelector(".last-page-footer .page-footer-content");
            const actualHeaderPx = firstPageHeader instanceof HTMLElement ? firstPageHeader.offsetHeight : estimateHFHeightPx(metadata?.header);
            const actualFooterPx = lastPageFooter instanceof HTMLElement ? lastPageFooter.offsetHeight : estimateHFHeightPx(metadata?.footer);

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

            // Create Widget Decorations
            const decorations: Decoration[] = result.breaks.map((brk) => {
              const element = createPageBreakElement({
                remainingPx: brk.remainingPx,
                pageNumber: brk.pageNumber,
                nextPageNumber: brk.pageNumber + 1,
                docTitle: docTitle || "",
                metadata,
                isExplicitBreak: brk.isExplicitBreak,
              });

              return Decoration.widget(brk.pos, element, {
                side: -1,
                key: `page-break-${brk.pos}-${brk.pageNumber}`,
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
            view.dispatch(tr);
          } finally {
            isRecalculating = false;
          }
        };

        const scheduleRecalc = (view: EditorView) => {
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => recalculate(view), 150);
        };

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
