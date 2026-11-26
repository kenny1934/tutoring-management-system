import { useLayoutEffect } from 'react';
import { render, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { isCancelledSearchRequest, useAbortableRequest } from './useAbortableRequest';

describe('search request cancellation', () => {
  it('marks deliberate cancellation and leaves the replacement request usable', async () => {
    const view=renderHook(({queryKey,active})=>useAbortableRequest(queryKey,active),{initialProps:{queryKey:'old',active:true}});
    const outcome=view.result.current(signal=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('signal is aborted without reason','AbortError'))))).catch(error=>error);
    view.rerender({queryKey:'new',active:true});
    expect(isCancelledSearchRequest(await outcome)).toBe(true);
    await expect(view.result.current(async()=> 'Latest results')).resolves.toBe('Latest results');
  });
  it('does not start retained fetchers belonging to an inactive or superseded view', async () => {
    const view=renderHook(({queryKey,active})=>useAbortableRequest(queryKey,active),{initialProps:{queryKey:'old',active:true}}),run=vi.fn();
    const previous=view.result.current;view.rerender({queryKey:'new',active:true});
    expect(isCancelledSearchRequest(await previous(run).catch(error=>error))).toBe(true);
    view.rerender({queryKey:'new',active:false});
    expect(isCancelledSearchRequest(await view.result.current(run).catch(error=>error))).toBe(true);
    expect(run).not.toHaveBeenCalled();
  });
  it('rejects stale responses even when a transport ignores its abort signal', async () => {
    let finish!:(value:string)=>void;
    const view=renderHook(({queryKey})=>useAbortableRequest(queryKey,true),{initialProps:{queryKey:'old'}});
    const outcome=view.result.current(()=>new Promise<string>(resolve=>{finish=resolve})).catch(error=>error);
    view.rerender({queryKey:'new'});finish('Old results');
    expect(isCancelledSearchRequest(await outcome)).toBe(true);
  });
  it('preserves real failures even when their message mentions an abort', async () => {
    const view=renderHook(()=>useAbortableRequest('current',true));
    const error=new Error('signal is aborted without reason');
    await expect(view.result.current(async()=>{throw error})).rejects.toBe(error);
    expect(isCancelledSearchRequest(error)).toBe(false);
  });
});


it('does not let inactive-state cleanup abort a same-query replacement started in layout', async () => {
  const signals:AbortSignal[]=[];
  let outcome!:Promise<unknown>;
  function Harness({active}:{active:boolean}) {
    const request=useAbortableRequest('same query',active);
    useLayoutEffect(()=>{if(active)outcome=request(async signal=>{signals.push(signal);return 'Latest results'}).catch(error=>error)},[active,request]);
    return null;
  }
  const view=render(<Harness active={false}/>);view.rerender(<Harness active/>);
  expect(signals).toHaveLength(1);expect(signals[0].aborted).toBe(false);
  await expect(outcome).resolves.toBe('Latest results');
});
