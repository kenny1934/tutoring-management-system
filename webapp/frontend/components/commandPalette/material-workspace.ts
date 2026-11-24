import type { PdfViewState } from '@/components/lesson/PdfPageViewer';

export type MaterialFilters = { share: string; ext: string; modified: string; folder: string; sort: string };
export const defaultMaterialFilters = (): MaterialFilters => ({ share: '', ext: '', modified: '', folder: '', sort: 'relevance' });

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

/** Only coordinates live here. PDF bytes, extracted text and result rows stay in the scoped request cache. */
export type MaterialWorkspace = {
  filters: MaterialFilters;
  expanded: boolean;
  selection: { key: string; id: number } | null;
  searchKey: string;
  size: number;
  listTop: number;
  reading: { key: string; place: MaterialReadingPlace } | null;
};
export const createMaterialWorkspace = (): MaterialWorkspace => ({
  filters: defaultMaterialFilters(), expanded: false, selection: null, searchKey: '', size: 1, listTop: 0, reading: null,
});
