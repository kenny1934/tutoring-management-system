/**
 * Utilities for finding and opening answer files for exercises.
 * Supports local file system search and Paperless/Shelv fallback.
 */

import { getFileHandleFromPath, openFileInNewTab, isFileSystemAccessSupported } from './file-system';
import { paperlessAPI } from './api';

export interface AnswerSearchResult {
  path: string;
  source: 'local' | 'shelv';
  documentId?: number;  // For Shelv results
}

// Cache for the "Ans" tag ID from Shelv
let ansTagIdCache: number | null = null;

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
  // Add more rules here as needed
];

/**
 * Get the "Ans" tag ID from Shelv, with caching.
 */
async function getAnsTagId(): Promise<number | null> {
  if (ansTagIdCache !== null) {
    return ansTagIdCache;
  }

  try {
    const { tags } = await paperlessAPI.getTags();
    const ansTag = tags.find(t => t.name.toLowerCase() === 'ans');
    if (ansTag) {
      ansTagIdCache = ansTag.id;
      return ansTag.id;
    }
  } catch (err) {
    console.warn('[AnswerSearch] Failed to fetch tags:', err);
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
  path = path.replace(/^["']|["']$/g, '');

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
  const extMatch = filename.match(/^(.+)\.pdf$/i);
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
    const modifiedParts = directoryParts.map(part =>
      CENTER_FOLDER_REPLACEMENTS[part] ?? part
    );

    // Check for special filename transformations first (e.g., DSE_09.4_xxx → DSE_09.4_KEY)
    for (const rule of FILENAME_TRANSFORMATIONS) {
      const match = filenameWithoutExt.match(rule.pattern);
      if (match) {
        const ansFilename = rule.answerFilename(match);
        const ansPath = `[Center]\\${modifiedParts.join('\\')}\\${ansFilename}.pdf`;
        candidates.push(ansPath);
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

  return candidates;
}

/**
 * Search for an answer file locally using the File System Access API.
 * Tries multiple candidate paths.
 */
async function searchLocalAnswerFile(originalPath: string): Promise<AnswerSearchResult | null> {
  if (!isFileSystemAccessSupported()) {
    return null;
  }

  const candidates = buildAnswerPaths(originalPath);

  for (const candidatePath of candidates) {
    const result = await getFileHandleFromPath(candidatePath);
    if (result.success) {
      return { path: candidatePath, source: 'local' };
    }
  }

  return null;
}

/**
 * Search for an answer file in Shelv using the filename and Ans tag.
 */
async function searchShelvAnswerFile(originalPath: string): Promise<AnswerSearchResult | null> {
  const { filenameWithoutExt } = parsePdfPath(originalPath);

  // Build search query for the answer filename
  const searchQuery = `${filenameWithoutExt}_ans`;

  try {
    // Get the Ans tag ID
    const ansTagId = await getAnsTagId();

    // Search Shelv with tag filtering if available
    const tagIds = ansTagId ? [ansTagId] : undefined;
    const results = await paperlessAPI.search(searchQuery, 10, 'title', tagIds);

    if (results.results.length > 0) {
      // Find the best match (exact filename match preferred)
      const bestMatch = results.results.find(doc => {
        const docFilename = doc.title.toLowerCase();
        return docFilename.includes(filenameWithoutExt.toLowerCase()) &&
               docFilename.includes('ans');
      }) || results.results[0];

      return {
        path: bestMatch.original_path || bestMatch.title,
        source: 'shelv',
        documentId: bestMatch.id,
      };
    }

    // If no results with tag filter, try without tag filter
    if (ansTagId) {
      const resultsNoTag = await paperlessAPI.search(searchQuery, 10, 'title');
      if (resultsNoTag.results.length > 0) {
        const bestMatch = resultsNoTag.results.find(doc => {
          const docFilename = doc.title.toLowerCase();
          return docFilename.includes(filenameWithoutExt.toLowerCase()) &&
                 docFilename.includes('ans');
        });

        if (bestMatch) {
          return {
            path: bestMatch.original_path || bestMatch.title,
            source: 'shelv',
            documentId: bestMatch.id,
          };
        }
      }
    }
  } catch (err) {
    console.warn('[AnswerSearch] Shelv search failed:', err);
  }

  return null;
}

/**
 * Search for an answer file, trying local first then Shelv.
 *
 * @param originalPath - The original exercise PDF path
 * @returns The answer file result or null if not found
 */
export async function searchAnswerFile(originalPath: string): Promise<AnswerSearchResult | null> {
  // 1. Try local file system first
  const localResult = await searchLocalAnswerFile(originalPath);
  if (localResult) {
    return localResult;
  }

  // 2. Fall back to Shelv search
  const shelvResult = await searchShelvAnswerFile(originalPath);
  if (shelvResult) {
    return shelvResult;
  }

  return null;
}

/**
 * Open an answer file in a new tab.
 *
 * @param result - The answer search result
 * @returns true if successful, false otherwise
 */
export async function openAnswerFile(result: AnswerSearchResult): Promise<boolean> {
  if (result.source === 'local') {
    const handleResult = await getFileHandleFromPath(result.path);
    if (handleResult.success) {
      return openFileInNewTab(handleResult.handle);
    }
    return false;
  } else if (result.source === 'shelv' && result.documentId) {
    // Open via Paperless API
    window.open(`/api/paperless/preview/${result.documentId}`, '_blank');
    return true;
  }

  return false;
}

/**
 * Download an answer file.
 *
 * @param result - The answer search result
 * @returns true if successful, false otherwise
 */
export async function downloadAnswerFile(result: AnswerSearchResult): Promise<boolean> {
  if (result.source === 'local') {
    const handleResult = await getFileHandleFromPath(result.path);
    if (handleResult.success) {
      try {
        const file = await handleResult.handle.getFile();
        const url = URL.createObjectURL(file);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return true;
      } catch (err) {
        console.error('[AnswerDownload] Failed to download local file:', err);
        return false;
      }
    }
    return false;
  } else if (result.source === 'shelv' && result.documentId) {
    // Download via Paperless API
    try {
      const response = await fetch(`/api/paperless/preview/${result.documentId}`);
      if (!response.ok) {
        return false;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // Extract filename from path or use document ID
      const filename = result.path.split('\\').pop() || `answer_${result.documentId}.pdf`;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return true;
    } catch (err) {
      console.error('[AnswerDownload] Failed to download from Shelv:', err);
      return false;
    }
  }

  return false;
}
