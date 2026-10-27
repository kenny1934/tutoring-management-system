import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, fetchAPI, fetchResponse } from './api';

const request = vi.fn();
beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); vi.stubGlobal('fetch', request); });
afterEach(() => { vi.unstubAllGlobals(); sessionStorage.clear(); });

describe('shared authenticated response transport', () => {
  it('retains JSON and 204 compatibility', async () => {
    request.mockResolvedValueOnce(new Response(JSON.stringify({ value: 4 }), { headers: { 'Content-Type': 'application/json' } }));
    request.mockResolvedValueOnce(new Response(null, { status: 204 }));
    expect(await fetchAPI('/synthetic/json')).toEqual({ value: 4 });
    expect(await fetchAPI('/synthetic/empty', { method: 'DELETE' })).toBeUndefined();
    expect(request.mock.calls[0][1]).toMatchObject({ credentials: 'include', headers: { 'Content-Type': 'application/json' } });
  });
  it('preserves cookie, effective role and exact JSON body for a binary response', async () => {
    sessionStorage.setItem('csm_impersonated_role', 'Admin');
    const file = new Response(new Uint8Array([80, 75]), { headers: { 'X-CSM-Export-Total': '1600.00' } }); request.mockResolvedValueOnce(file);
    const abort = new AbortController(); const body = JSON.stringify({ collection_month: '2026-11', branch: 'MSA' });
    const result = await fetchResponse('/billing/autopay/export', { method: 'POST', body, signal: abort.signal });
    expect(result).toBe(file); expect(result.headers.get('X-CSM-Export-Total')).toBe('1600.00');
    expect(request).toHaveBeenCalledWith(expect.stringContaining('/billing/autopay/export'), expect.objectContaining({ method: 'POST', body, signal: abort.signal, credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-Effective-Role': 'Admin' } }));
  });
  it('refreshes authentication once and retries the original binary request with its scope intact', async () => {
    sessionStorage.setItem('csm_impersonated_role', 'Admin');
    const file = new Response(new Uint8Array([80, 75]));
    request.mockResolvedValueOnce(new Response(null, { status: 401 })).mockResolvedValueOnce(new Response(null, { status: 200 })).mockResolvedValueOnce(file);
    const options = { method: 'POST', body: '{"branch":"MSB"}' };
    expect(await fetchResponse('/billing/autopay/export', options)).toBe(file);
    expect(request).toHaveBeenCalledTimes(3);
    expect(request.mock.calls[1][0]).toContain('/auth/refresh');
    expect(request.mock.calls[2][1]).toMatchObject({ ...options, credentials: 'include', headers: { 'X-Effective-Role': 'Admin' } });
  });
  it('preserves structured errors and stops after one failed authenticated retry', async () => {
    request.mockResolvedValueOnce(new Response(JSON.stringify({ detail: { code: 'READY_CHANGED', message: 'Ready payments changed.' } }), { status: 409 }));
    await expect(fetchResponse('/billing/autopay/export')).rejects.toMatchObject({ name: 'ApiError', status: 409, detail: { code: 'READY_CHANGED' } });
    request.mockResolvedValueOnce(new Response(null, { status: 401 })).mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ detail: 'Denied.' }), { status: 401 }));
    await expect(fetchResponse('/billing/autopay/export')).rejects.toBeInstanceOf(ApiError);
    expect(request).toHaveBeenCalledTimes(4);
  });
});
