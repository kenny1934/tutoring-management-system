import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ json: vi.fn(), response: vi.fn() }));
vi.mock('./api', () => ({ fetchAPI: mocks.json, fetchResponse: mocks.response, ApiError: class extends Error { status: number; constructor(status: number) { super(); this.status = status; } } }));
import { ApiError } from './api';
import { canonicalMaterialPath, loadMaterialPdf } from './materials';

beforeEach(() => { mocks.json.mockReset(); mocks.response.mockReset(); });
describe('MCKB original resolution', () => {
  it('keeps scan inside its real source root', () => {
    expect(canonicalMaterialPath('W:\\scan\\work.pdf')).toBe('[MSA Staff]\\scan\\work.pdf');
    expect(canonicalMaterialPath('[MSA Staff]\\private\\work.pdf')).toBeNull();
  });
  it('does not query a material provider for unrelated paths', async () => {
    expect(await loadMaterialPdf('worksheet.pdf')).toBeNull(); expect(mocks.json).not.toHaveBeenCalled();
  });
  it('resolves through the authenticated provider and validates PDF bytes', async () => {
    const bytes = new TextEncoder().encode('%PDF-1.7').buffer;
    mocks.json.mockResolvedValue({ file_id: 7 }); mocks.response.mockResolvedValue({ arrayBuffer: async () => bytes });
    expect(await loadMaterialPdf('[Center]\\work.pdf')).toEqual({ data: bytes });
    expect(mocks.response.mock.calls[0][0]).toBe('/materials/7/raw');
  });
  it('does not turn forbidden access into a legacy-source fallback', async () => {
    mocks.json.mockRejectedValue(new (ApiError as unknown as new (status: number) => Error)(403));
    expect(await loadMaterialPdf('[Center]\\work.pdf')).toEqual({ denied: true });
  });
  it('rejects an HTML error masquerading as a PDF', async () => {
    mocks.json.mockResolvedValue({ file_id: 7 }); mocks.response.mockResolvedValue({ arrayBuffer: async () => new TextEncoder().encode('<html>').buffer });
    expect(await loadMaterialPdf('[Center]\\work.pdf')).toBeNull();
  });
});
