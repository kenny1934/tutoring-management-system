/**
 * Utilities for finding and opening answer files for exercises.
 * Supports local file system search and MCKB originals.
 */

import { getFileHandleFromPath, isFileSystemAccessSupported, openFileFromPathWithFallback } from './file-system';
import { canonicalMaterialPath } from './materials';
import { loadCoursewarePdf } from './courseware-pdf';
import { resolveCoursewareFile, searchCoursewareFiles } from './courseware-lookup';

export interface AnswerSearchResult {
  path: string;
  source: 'local' | 'mckb';
  fileId?: number;
}

/**
 * Configurable folder replacement rules for [Center] paths.
 * Add new rules here as edge cases are discovered.
 * Key = original folder name, Value = replacement folder name
 */
const CENTER_FOLDER_REPLACEMENTS: Record<string, string> = {
  'Courseware (Eng)': 'ANS',
  'Courseware (Chi)': 'ANS',
  'IB': 'IB_2020',
  'DSE': 'DSE_key',
};

/**
 * Configurable filename transformation rules for answer files.
 * Each rule specifies a pattern to match and how to build the answer filename.
 * Rules are checked in order; first match wins.
 */
const FILENAME_TRANSFORMATIONS: Array<{
  pattern: RegExp;      // Pattern to match filename (without .pdf)
  answerFilename: (match: RegExpMatchArray) => string;  // Build answer filename from match
}> = [
  // DSE: DSE_09.4_xxx → DSE_09.4_KEY
  {
    pattern: /^(DSE_\d+\.\d+)_/i,
    answerFilename: (match) => `${match[1]}_KEY`,
  },
  {
    pattern: /^(IGCSE_\d{2}(?:\.\d+)?)_/i,
    answerFilename: (match) => `${match[1]}_ANS`,
  },
  {
    pattern: /^(SAT_\d+_.+)$/i,
    answerFilename: (match) => `${match[1]}_KEY`,
  },
  // Add more rules here as needed
];

/** Use the same filename rules for local paths and courseware queries. */
function getTransformedAnswerFilename(filename: string): string | null {
  for (const rule of FILENAME_TRANSFORMATIONS) {
    const match = filename.match(rule.pattern);
    if (match) return rule.answerFilename(match);
  }
  return null;
}

/**
 * Parse a PDF path to extract alias, directory components, and filename.
 */
function parsePdfPath(path: string): {
  alias: string | null;
  directoryParts: string[];
  filename: string;
  filenameWithoutExt: string;
} {
  // Strip surrounding quotes
  path = canonicalMaterialPath(path) ?? path.replace(/^["']|["']$/g, '').replace(/\//g, '\\');

  // Check for bracketed alias like [Center] or [Courseware Developer 中學]
  const aliasMatch = path.match(/^\[([^\]]+)\]\\(.+)$/);

  let alias: string | null = null;
  let restOfPath: string;

  if (aliasMatch) {
    alias = aliasMatch[1];
    restOfPath = aliasMatch[2];
  } else {
    // Check for non-bracketed alias (first path segment)
    const parts = path.split('\\');
    if (parts.length >= 2) {
      alias = parts[0];
      restOfPath = parts.slice(1).join('\\');
    } else {
      restOfPath = path;
    }
  }

  const pathParts = restOfPath.split('\\');
  const filename = pathParts[pathParts.length - 1];
  const directoryParts = pathParts.slice(0, -1);

  // Remove extension
  const extMatch = filename.match(/^(.+)\.(?:pdf|docx?|xlsx?|pptx?)$/i);
  const filenameWithoutExt = extMatch ? extMatch[1] : filename;

  return { alias, directoryParts, filename, filenameWithoutExt };
}

/**
 * Build candidate answer paths from an original exercise path.
 * Generates multiple paths to try based on different conventions.
 */
export function buildAnswerPaths(originalPath: string): string[] {
  const { alias, directoryParts, filenameWithoutExt } = parsePdfPath(originalPath);
  const candidates: string[] = [];

  // Case variations for the _ANS suffix
  const suffixes = ['_ANS', '_ans', '_Ans'];

  if (alias === 'Center') {
    // Pattern 1: Apply configurable folder replacements
    // e.g., [Center]\Courseware (Eng)\IB\abc.pdf → [Center]\ANS\IB_2020\abc_ANS.pdf
    const modifiedParts = directoryParts.map((part, index) => {
      // SG uses P1–P6 for worksheets and 1–6 for answers.
      if (directoryParts[index - 1]?.toUpperCase() === 'SG') {
        if (/^P[1-6]$/i.test(part)) return part.slice(1);
        if (part.toUpperCase() === 'MOCK') return 'Mock';
      }
      return CENTER_FOLDER_REPLACEMENTS[part] ?? part;
    });

    // Check for special filename transformations first (e.g., DSE_09.4_xxx → DSE_09.4_KEY)
    const transformedFilename = getTransformedAnswerFilename(filenameWithoutExt);
    if (transformedFilename) {
      const filenames = transformedFilename.endsWith('_KEY')
        ? [transformedFilename, transformedFilename.replace(/_KEY$/, '_key'), transformedFilename.replace(/_KEY$/, '_Key')]
        : [transformedFilename];
      for (const filename of filenames) {
        candidates.push(`[Center]\\${modifiedParts.join('\\')}\\${filename}.pdf`);
      }
    }

    // Then add standard _ANS suffix candidates
    for (const suffix of suffixes) {
      const ansPath = `[Center]\\${modifiedParts.join('\\')}\\${filenameWithoutExt}${suffix}.pdf`;
      candidates.push(ansPath);
    }
  } else if (alias === 'Courseware Developer 中學' || alias === 'Courseware Developer') {
    // Pattern 2: Insert Ans folder in same directory as file
    for (const suffix of suffixes) {
      const ansPath = `[${alias}]\\${directoryParts.join('\\')}\\Ans\\${filenameWithoutExt}${suffix}.pdf`;
      candidates.push(ansPath);
    }
    // Also try ANS folder
    for (const suffix of suffixes) {
      const ansPath = `[${alias}]\\${directoryParts.join('\\')}\\ANS\\${filenameWithoutExt}${suffix}.pdf`;
      candidates.push(ansPath);
    }
  } else if (alias) {
    // Generic pattern for other aliases: try Ans subfolder in same directory
    for (const suffix of suffixes) {
      const ansPath = `[${alias}]\\${directoryParts.join('\\')}\\Ans\\${filenameWithoutExt}${suffix}.pdf`;
      candidates.push(ansPath);
    }
    for (const suffix of suffixes) {
      const ansPath = `[${alias}]\\${directoryParts.join('\\')}\\ANS\\${filenameWithoutExt}${suffix}.pdf`;
      candidates.push(ansPath);
    }
  }

  return candidates.map(path => path.replace(/\\{2,}/g, '\\'));
}

/** Expected answer names are checked before searching elsewhere by filename. */
export async function searchAnswerFile(originalPath: string): Promise<AnswerSearchResult | null> {
  const candidates = [...new Map(buildAnswerPaths(originalPath).map(path => [path.toLowerCase(), path])).values()];
  if (isFileSystemAccessSupported()) {
    for (const path of candidates) {
      const found = await getFileHandleFromPath(path, { requestPermission: false });
      if (found.success) return { path, source: 'local' };
    }
  }
  for (const path of candidates) {
    try {
      const found = await resolveCoursewareFile(path);
      return { path: found.nas_path, source: 'mckb', fileId: found.file_id };
    } catch (error) {
      const status = error && typeof error === 'object' && 'status' in error ? Number(error.status) : 0;
      if (status !== 404) throw error;
    }
  }
  const { filenameWithoutExt } = parsePdfPath(originalPath);
  const expected = (getTransformedAnswerFilename(filenameWithoutExt) ?? `${filenameWithoutExt}_ANS`) + '.pdf';
  const found = await searchCoursewareFiles(expected);
  const exact = found.files.filter(file => file.ext.toLowerCase() === '.pdf' && file.filename.toLowerCase() === expected.toLowerCase());
  if (!found.complete || exact.length !== 1) return null;
  return { path: exact[0].nas_path, source: 'mckb', fileId: exact[0].file_id };
}

export async function openAnswerFile(result: AnswerSearchResult): Promise<boolean> {
  return await openFileFromPathWithFallback(result.path) === null;
}

export async function downloadAnswerFile(result: AnswerSearchResult): Promise<boolean> {
  try {
    const file = await loadCoursewarePdf({ path: result.path, fileId: result.fileId });
    const url = URL.createObjectURL(new Blob([file.data], { type: 'application/pdf' }));
    const link = document.createElement('a'); link.href = url;
    link.download = result.path.split(/[\\/]/).at(-1) || 'answer.pdf';
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return true;
  } catch { return false; }
}

export async function openAnswerFileWithFallback(path: string, onProgress?: (message: string) => void): Promise<boolean> {
  onProgress?.('Opening answer PDF…');
  return openAnswerFile({ source: 'mckb', path });
}
export async function downloadAnswerFileWithFallback(path: string, onProgress?: (message: string) => void): Promise<boolean> {
  onProgress?.('Opening answer PDF…');
  return downloadAnswerFile({ source: 'mckb', path });
}
