/**
 * Synthetic pdf_name scheme encoding two real paths to compose side by
 * side at load time (left beside right). "|" is illegal in Windows
 * filenames, so it can't collide with a real path. These only ever live
 * inside ephemeral preview exercises — never persisted.
 */

const PARALLEL_SCHEME = "parallel:";

export function buildParallelPath(left: string, right: string): string {
  return `${PARALLEL_SCHEME}${left}|${right}`;
}

export function parseParallelPath(
  pdfName: string
): { left: string; right: string } | null {
  if (!pdfName.startsWith(PARALLEL_SCHEME)) return null;
  const sep = pdfName.indexOf("|", PARALLEL_SCHEME.length);
  if (sep < 0) return null;
  return {
    left: pdfName.slice(PARALLEL_SCHEME.length, sep),
    right: pdfName.slice(sep + 1),
  };
}
