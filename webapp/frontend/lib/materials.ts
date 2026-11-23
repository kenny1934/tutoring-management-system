import { fetchAPI, fetchResponse } from './api';

export function canonicalMaterialPath(path: string): string | null {
  let value = path.replace(/\//g, '\\').replace(/^\\\\[^\\]+\\([^\\]+)\\/, '[$1]\\');
  if (/^Z:\\/i.test(value)) value = value.replace(/^Z:/i, '[Center]');
  if (/^V:\\/i.test(value)) value = value.replace(/^V:/i, '[Courseware Developer 中學]');
  if (/^W:\\scan\\/i.test(value)) value = value.replace(/^W:/i, '[MSA Staff]');
  return /^\[(?:Center|Courseware Developer 中學)\]\\/i.test(value) || /^\[MSA Staff\]\\scan\\/i.test(value) ? value : null;
}

export async function loadMaterialPdf(path: string, signal?: AbortSignal): Promise<{ data: ArrayBuffer } | { denied: true } | null> {
  const canonical = canonicalMaterialPath(path);
  if (!canonical || !/\.pdf$/i.test(canonical)) return null;
  try {
    const file = await fetchAPI<{ file_id: number }>('/materials/resolve', { method: 'POST', body: JSON.stringify({ path: canonical }), signal });
    const response = await fetchResponse(`/materials/${file.file_id}/raw`, { signal });
    const data = await response.arrayBuffer();
    if (String.fromCharCode(...new Uint8Array(data, 0, Math.min(5, data.byteLength))) !== '%PDF-') return null;
    return { data };
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error && typeof error === 'object' && 'status' in error && [401, 403].includes(Number(error.status))) return { denied: true };
    return null;
  }
}
