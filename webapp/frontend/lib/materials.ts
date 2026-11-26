export function canonicalMaterialPath(path: string): string | null {
  let value = path.trim().replace(/^"(.*)"$/, '$1').replace(/\//g, '\\').replace(/^\\\\[^\\]+\\([^\\]+)\\/, '[$1]\\');
  if (/^Z:\\/i.test(value)) value = value.replace(/^Z:/i, '[Center]');
  if (/^V:\\/i.test(value)) value = value.replace(/^V:/i, '[Courseware Developer 中學]');
  if (/^W:\\scan\\/i.test(value)) value = value.replace(/^W:/i, '[MSA Staff]');
  value = value.replace(/^(Center|Courseware Developer 中學|MSA Staff)\\/i, '[$1]\\');
  return /^\[(?:Center|Courseware Developer 中學)\]\\/i.test(value) || /^\[MSA Staff\]\\scan\\/i.test(value) ? value : null;
}

export async function loadMaterialPdf(path: string, signal?: AbortSignal): Promise<{ data: ArrayBuffer } | { denied: true } | null> {
  const canonical = canonicalMaterialPath(path);
  if (!/\.pdf$/i.test(path.trim().replace(/["']$/, ''))) return null;
  try {
    const { loadCoursewarePdf } = await import('./courseware-pdf');
    const file = await loadCoursewarePdf({ path: canonical ?? path, signal, localFirst: false });
    return { data: file.data };
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error && typeof error === 'object' && 'status' in error && [401, 403].includes(Number(error.status))) return { denied: true };
    return null;
  }
}
