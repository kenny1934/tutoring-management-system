import { fetchAPI, fetchResponse } from './api';
import { canonicalMaterialPath } from './materials';
import { resolveCoursewareFile } from './courseware-lookup';

export type CoursewarePdf = { data: ArrayBuffer; source: 'local' | 'mckb'; fileId?: number };
const MAX_BYTES = 32 * 1024 * 1024, MAX_FILES = 8, MAX_AGE = 2 * 60 * 1000;
const cache = new Map<string, { value: CoursewarePdf; at: number }>();
let owner = '', generation = 0;

/** Switching accounts or roles discards bytes and prevents late requests caching them. */
export function setCoursewarePdfScope(scope: string) {
  if (scope !== owner) { cache.clear(); owner = scope; generation++; }
}
export function clearCoursewarePdfCache() { cache.clear(); generation++; }
function remember(key: string, value: CoursewarePdf) {
  if (value.data.byteLength > MAX_BYTES) return;
  cache.delete(key); cache.set(key, { value, at: Date.now() });
  let bytes = [...cache.values()].reduce((sum, entry) => sum + entry.value.data.byteLength, 0);
  while (cache.size > MAX_FILES || bytes > MAX_BYTES) {
    const first = cache.keys().next().value!; bytes -= cache.get(first)!.value.data.byteLength; cache.delete(first);
  }
}
function pdf(data: ArrayBuffer): ArrayBuffer {
  if (String.fromCharCode(...new Uint8Array(data, 0, Math.min(5, data.byteLength))) !== '%PDF-') throw new Error('The original did not return a PDF.');
  return data;
}

export async function loadCoursewarePdf({ path, fileId, scope, signal, localFirst = true, refresh = false }: {
  path: string; fileId?: number; scope?: string; signal?: AbortSignal; localFirst?: boolean; refresh?: boolean;
}): Promise<CoursewarePdf> {
  signal?.throwIfAborted();
  const capturedOwner = owner, capturedGeneration = generation;
  const identity = owner || scope;
  let canonical = canonicalMaterialPath(path);
  let resolvedId = fileId;
  if (!canonical && !resolvedId) {
    const resolved = await resolveCoursewareFile(path, signal);
    canonical = canonicalMaterialPath(resolved.nas_path);
    resolvedId = resolved.file_id;
    if (!canonical) throw new Error('This courseware path cannot be opened.');
  }
  fileId = resolvedId;
  signal?.throwIfAborted();
  const key = JSON.stringify([identity, canonical?.toLowerCase() || fileId]);
  const saved = cache.get(key);
  if (!refresh && identity && saved && Date.now() - saved.at < MAX_AGE && (!fileId || !saved.value.fileId || saved.value.fileId === fileId)) {
    cache.delete(key); cache.set(key, saved); return saved.value;
  }
  cache.delete(key);
  const save = (value: CoursewarePdf) => {
    signal?.throwIfAborted();
    if (identity && owner === capturedOwner && generation === capturedGeneration) remember(key, value);
    return value;
  };
  if (canonical && localFirst) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const local = (async (): Promise<CoursewarePdf> => {
        const fs = await import('./file-system');
        if (!fs.isFileSystemAccessSupported()) throw new Error('Connected folders unavailable.');
        const result = await fs.getFileHandleFromPath(canonical, { requestPermission: false });
        if (!result.success) throw new Error('Connected file unavailable.');
        signal?.throwIfAborted();
        const file = await result.handle.getFile();
        const data = pdf(await file.arrayBuffer());
        signal?.throwIfAborted(); return { data, source: 'local', fileId };
      })();
      const value = await Promise.race([local, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Connected file timed out.')), 5000); })]);
      return save(value);
    } catch { signal?.throwIfAborted(); }
    finally { clearTimeout(timer); }
  }
  signal?.throwIfAborted();
  if (!fileId) {
    if (!canonical) throw new Error('This courseware path cannot be opened.');
    fileId = (await fetchAPI<{ file_id: number }>('/materials/resolve', { method: 'POST', body: JSON.stringify({ path: canonical }), signal })).file_id;
  }
  signal?.throwIfAborted();
  const response = await fetchResponse(`/materials/${fileId}/raw`, { signal });
  return save({ data: pdf(await response.arrayBuffer()), source: 'mckb', fileId });
}
