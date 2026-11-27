import type { MaterialResult } from './MaterialSearch';
import type { PdfViewState } from '@/components/lesson/PdfPageViewer';

export type MaterialFilters = { share: string; ext: string; modified: string; folder: string; folder_scope: string; sort: string; match: string; any_words: string; exclude_words: string; exact_phrase: string; search_in: string; modified_from: string; modified_to: string };
export const defaultMaterialFilters = (): MaterialFilters => ({ share: '', ext: '', modified: '', folder: '', folder_scope: 'subtree', sort: 'relevance', match: 'all', any_words: '', exclude_words: '', exact_phrase: '', search_in: 'both', modified_from: '', modified_to: '' });

export type MaterialReadingPlace = {
  textTop: number | null;
  matchIndex: number;
  matchPage: number | null;
  focusPage: number | null;
  showOriginal: boolean;
  pdfStartPage: number;
  rotation: number;
  pdfViews: Map<number, PdfViewState>;
};
export const createMaterialReadingPlace = (): MaterialReadingPlace => ({
  textTop: null, matchIndex: 0, matchPage: null, focusPage: null, showOriginal: false, pdfStartPage: 1, rotation: 0, pdfViews: new Map(),
});

/** Reading coordinates and selected document metadata live here. PDF bytes and extracted text stay in their scoped caches. */
export type MaterialBasketEntry = { material: MaterialResult; pages: string };

export type MaterialWorkspace = {
  basket: MaterialBasketEntry[];
  filters: MaterialFilters;
  selection: { key: string; id: number } | null;
  searchKey: string;
  size: number;
  listTop: number;
  browsePlaces: Map<string, { top: number; size: number }>;
  reading: { key: string; place: MaterialReadingPlace } | null;
};
export const createMaterialWorkspace = (): MaterialWorkspace => ({
  basket: [], filters: defaultMaterialFilters(), selection: null, searchKey: '', size: 1, listTop: 0, browsePlaces: new Map(), reading: null,
});
