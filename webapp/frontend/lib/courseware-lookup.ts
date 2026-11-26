import { fetchAPI } from './api';
import { canonicalMaterialPath } from './materials';

export type CoursewareFile = { file_id: number; filename: string; nas_path: string; rel_path: string; share: string; ext: string; page_count: number | null; duplicate_count?: number; duplicate_locations?: { share: string; nas_path: string; rel_path: string }[] };
type Results = { total: number; page_size: number; results: CoursewareFile[] };
export const coursewareBasename = (path: string) => path.trim().replace(/^["']|["']$/g, '').split(/[\\/]/).at(-1) || '';
const fold = (value: string) => value.normalize('NFC').toLowerCase();
export const coursewareLookupError = (status: number, message: string) => Object.assign(new Error(message), { status });

/** Filename-only search never interprets the name as Boolean syntax or worksheet text. */
export async function searchCoursewareFiles(filename: string, signal?: AbortSignal) {
  const name = coursewareBasename(filename);
  if (!name || name.length > 256) throw coursewareLookupError(422, 'Choose a filename of 256 characters or fewer.');
  const result = await fetchAPI<Results>('/materials/search', { method: 'POST', body: JSON.stringify({ q: '', refine: { search_in: 'filename', exact_phrase: name }, page_size: 50 }), signal });
  const files = result.results.flatMap(file => [file, ...(file.duplicate_locations ?? []).map(copy => ({ ...file, ...copy, filename: coursewareBasename(copy.rel_path) }))]);
  const canonicalFiles = files.map(file => ({ ...file, nas_path: canonicalMaterialPath(file.nas_path) ?? file.nas_path }));
  const unique = [...new Map(canonicalFiles.map(file => [fold(file.nas_path), file])).values()];
  return { files: unique, complete: result.total <= result.results.length && result.results.every(file => (file.duplicate_count ?? 0) <= (file.duplicate_locations?.length ?? 0)) };
}

/** Resolve a supplied full path exactly. A bare filename is usable only when unambiguous. */
export async function resolveCoursewareFile(path: string, signal?: AbortSignal): Promise<{ file_id: number; filename: string; nas_path: string; page_count: number | null }> {
  const value = path.trim().replace(/^["']|["']$/g, '');
  const canonical = canonicalMaterialPath(value);
  if (canonical || /^\\(?!\\)/.test(value)) {
    const resolved = await fetchAPI<{ file_id: number; filename: string; nas_path?: string; page_count: number | null }>('/materials/resolve', { method: 'POST', body: JSON.stringify({ path: canonical ?? value }), signal });
    return { ...resolved, nas_path: resolved.nas_path ?? canonical! };
  }
  if (/[\\/]/.test(value)) throw coursewareLookupError(404, 'This courseware path cannot be opened.');
  const find = async (name: string) => {
    const result = await searchCoursewareFiles(name, signal);
    return { ...result, files: result.files.filter(file => fold(file.filename) === fold(name)) };
  };
  let found = await find(value);
  // Older Shelv titles carried a hash. Try the real name only if the literal name is absent.
  if (!found.files.length && /^\[[a-f0-9]{8}\]__/i.test(value)) found = await find(value.replace(/^\[[a-f0-9]{8}\]__/i, ''));
  if (!found.files.length) throw coursewareLookupError(404, 'This courseware file could not be found.');
  if (!found.complete || found.files.length !== 1) throw coursewareLookupError(409, 'More than one courseware file has this name. Choose its folder through courseware search.');
  return found.files[0];
}
