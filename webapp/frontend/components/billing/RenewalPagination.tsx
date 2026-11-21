'use client';

import { useState } from 'react';
import { Button, Input } from '@/components/controls';

export function RenewalPagination({ page, pages, disabled, onPage }: { page: number; pages: number; disabled: boolean; onPage: (page: number) => void }) {
  const [entry, setEntry] = useState<{ page: number; text: string } | null>(null);
  const [invalid, setInvalid] = useState(false);
  const text = entry?.page === page ? entry.text : String(page);
  function jump(event: React.FormEvent) {
    event.preventDefault();
    const next = Number(text);
    if (!/^\d+$/.test(text) || !Number.isSafeInteger(next) || next < 1 || next > pages) { setInvalid(true); return; }
    setInvalid(false); setEntry(null); onPage(next);
  }
  return <nav aria-label="Renewal pages" className="space-y-1">
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" disabled={disabled || page <= 1} onClick={() => { setEntry(null); setInvalid(false); onPage(page - 1); }}>Previous</Button>
      <form onSubmit={jump} className="flex items-center gap-2">
        <label className="flex items-center gap-2 text-xs">Page<Input aria-label="Go to renewal page" size="sm" inputMode="numeric" pattern="[0-9]*" className="w-14 text-center" value={text} disabled={disabled} aria-invalid={invalid || undefined} onChange={event => { setEntry({ page, text: event.target.value }); setInvalid(false); }} /></label>
        <span className="text-xs text-ink-subtle">of {pages}</span>
        <Button size="sm" type="submit" disabled={disabled}>Go</Button>
      </form>
      <Button size="sm" disabled={disabled || page >= pages} onClick={() => { setEntry(null); setInvalid(false); onPage(page + 1); }}>Next</Button>
    </div>
    {invalid && <p role="alert" className="text-xs text-red-700 dark:text-red-300">Enter a page from 1 to {pages}.</p>}
  </nav>;
}
