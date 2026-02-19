/**
 * Custom Find & Replace extension for TipTap v3.
 * Uses ProseMirror decorations to highlight search matches.
 *
 * Storage exposes: results (count), resultIndex (current), searchTerm, replaceTerm
 * Commands: setSearchTerm, setReplaceTerm, goToNextResult, goToPreviousResult,
 *           replaceCurrent, replaceAll, clearSearch
 */
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export const searchPluginKey = new PluginKey("searchAndReplace");

interface SearchState {
  searchTerm: string;
  replaceTerm: string;
  results: { from: number; to: number }[];
  resultIndex: number;
}

function findAllMatches(doc: { descendants: (cb: (node: { isText: boolean; text?: string | null }, pos: number) => void) => void }, searchTerm: string): { from: number; to: number }[] {
  if (!searchTerm) return [];
  const results: { from: number; to: number }[] = [];
  const term = searchTerm.toLowerCase();
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const text = node.text.toLowerCase();
    let index = text.indexOf(term);
    while (index !== -1) {
      results.push({ from: pos + index, to: pos + index + searchTerm.length });
      index = text.indexOf(term, index + 1);
    }
  });
  return results;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    searchAndReplace: {
      setSearchTerm: (term: string) => ReturnType;
      setReplaceTerm: (term: string) => ReturnType;
      goToNextResult: () => ReturnType;
      goToPreviousResult: () => ReturnType;
      replaceCurrent: () => ReturnType;
      replaceAll: () => ReturnType;
      clearSearch: () => ReturnType;
    };
  }
}

export const SearchAndReplace = Extension.create({
  name: "searchAndReplace",

  addStorage() {
    return {
      searchTerm: "",
      replaceTerm: "",
      results: 0,
      resultIndex: 0,
    };
  },

  addCommands() {
    return {
      setSearchTerm:
        (term: string) =>
        ({ editor, tr }) => {
          tr.setMeta(searchPluginKey, { searchTerm: term });
          this.storage.searchTerm = term;
          return true;
        },
      setReplaceTerm:
        (term: string) =>
        ({ editor }) => {
          this.storage.replaceTerm = term;
          return true;
        },
      goToNextResult:
        () =>
        ({ editor }) => {
          const pluginState = searchPluginKey.getState(editor.state) as SearchState | undefined;
          if (!pluginState || pluginState.results.length === 0) return false;
          const next = (pluginState.resultIndex + 1) % pluginState.results.length;
          const match = pluginState.results[next];
          if (!match) return false;
          // Single transaction: update index + move selection
          const { tr } = editor.state;
          tr.setMeta(searchPluginKey, { resultIndex: next });
          tr.setSelection(TextSelection.near(tr.doc.resolve(match.from)));
          editor.view.dispatch(tr);
          editor.view.focus();
          // Scroll into view
          const dom = editor.view.domAtPos(match.from);
          const el = dom.node instanceof HTMLElement ? dom.node : dom.node.parentElement;
          el?.scrollIntoView({ block: "center", behavior: "smooth" });
          return false; // already dispatched
        },
      goToPreviousResult:
        () =>
        ({ editor }) => {
          const pluginState = searchPluginKey.getState(editor.state) as SearchState | undefined;
          if (!pluginState || pluginState.results.length === 0) return false;
          const prev = (pluginState.resultIndex - 1 + pluginState.results.length) % pluginState.results.length;
          const match = pluginState.results[prev];
          if (!match) return false;
          const { tr } = editor.state;
          tr.setMeta(searchPluginKey, { resultIndex: prev });
          tr.setSelection(TextSelection.near(tr.doc.resolve(match.from)));
          editor.view.dispatch(tr);
          editor.view.focus();
          const dom = editor.view.domAtPos(match.from);
          const el = dom.node instanceof HTMLElement ? dom.node : dom.node.parentElement;
          el?.scrollIntoView({ block: "center", behavior: "smooth" });
          return false;
        },
      replaceCurrent:
        () =>
        ({ editor, tr }) => {
          const state = searchPluginKey.getState(editor.state) as SearchState | undefined;
          if (!state || state.results.length === 0) return false;
          const match = state.results[state.resultIndex];
          if (!match) return false;
          tr.insertText(this.storage.replaceTerm, match.from, match.to);
          tr.setMeta(searchPluginKey, { searchTerm: this.storage.searchTerm });
          return true;
        },
      replaceAll:
        () =>
        ({ editor, tr }) => {
          const state = searchPluginKey.getState(editor.state) as SearchState | undefined;
          if (!state || state.results.length === 0) return false;
          // Replace from end to start to preserve positions
          const sorted = [...state.results].sort((a, b) => b.from - a.from);
          for (const match of sorted) {
            tr.insertText(this.storage.replaceTerm, match.from, match.to);
          }
          tr.setMeta(searchPluginKey, { searchTerm: this.storage.searchTerm });
          return true;
        },
      clearSearch:
        () =>
        ({ tr }) => {
          tr.setMeta(searchPluginKey, { searchTerm: "" });
          this.storage.searchTerm = "";
          this.storage.replaceTerm = "";
          this.storage.results = 0;
          this.storage.resultIndex = 0;
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const extensionThis = this;
    return [
      new Plugin({
        key: searchPluginKey,
        state: {
          init(): SearchState {
            return { searchTerm: "", replaceTerm: "", results: [], resultIndex: 0 };
          },
          apply(tr, prev): SearchState {
            const meta = tr.getMeta(searchPluginKey);
            if (!meta) {
              // If doc changed, recalculate matches
              if (tr.docChanged && prev.searchTerm) {
                const results = findAllMatches(tr.doc, prev.searchTerm);
                const resultIndex = Math.min(prev.resultIndex, Math.max(0, results.length - 1));
                extensionThis.storage.results = results.length;
                extensionThis.storage.resultIndex = resultIndex;
                return { ...prev, results, resultIndex };
              }
              return prev;
            }
            const searchTerm = meta.searchTerm ?? prev.searchTerm;
            const resultIndex = meta.resultIndex ?? 0;
            if (meta.searchTerm !== undefined) {
              const results = findAllMatches(tr.doc, searchTerm);
              const idx = Math.min(resultIndex, Math.max(0, results.length - 1));
              extensionThis.storage.results = results.length;
              extensionThis.storage.resultIndex = idx;
              return { searchTerm, replaceTerm: prev.replaceTerm, results, resultIndex: idx };
            }
            extensionThis.storage.resultIndex = resultIndex;
            return { ...prev, resultIndex };
          },
        },
        props: {
          decorations(state) {
            const { searchTerm, results, resultIndex } = searchPluginKey.getState(state) as SearchState;
            if (!searchTerm || results.length === 0) return DecorationSet.empty;
            const decorations = results.map((match, i) =>
              Decoration.inline(match.from, match.to, {
                class: i === resultIndex ? "search-result search-result-current" : "search-result",
              })
            );
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
