import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useSavedCoursewareSearches } from './useSavedCoursewareSearches';
import { defaultMaterialFilters } from './material-workspace';
const entry = {query:'algebra',filters:{...defaultMaterialFilters(),share:'center',folder:'English/DSE',ext:'.pdf',exact_phrase:'quadratic equation'}};
beforeEach(()=>localStorage.clear());
it('persists complete named searches, deduplicates, renames, removes and isolates scope',()=>{
 const hook=renderHook(({scope})=>useSavedCoursewareSearches(scope),{initialProps:{scope:'one:Tutor:MSA'}});
 act(()=>{expect(hook.result.current.save(entry,'F4 algebra')).toBe(true)});
 act(()=>{hook.result.current.save(entry,'Duplicate')});expect(hook.result.current.entries).toHaveLength(1);
 const id=hook.result.current.entries[0].id;
 act(()=>{hook.result.current.rename(id,'Exam practice')});
 hook.rerender({scope:'two:Tutor:MSA'});expect(hook.result.current.entries).toEqual([]);
 hook.rerender({scope:'one:Tutor:MSA'});expect(hook.result.current.entries[0]).toEqual({...entry,id,name:'Exam practice'});
 hook.unmount();const reopened=renderHook(()=>useSavedCoursewareSearches('one:Tutor:MSA'));
 expect(reopened.result.current.entries[0].name).toBe('Exam practice');
 act(()=>{reopened.result.current.remove(id)});expect(reopened.result.current.entries).toEqual([]);
});
it('updates other mounted pickers in the same scope',()=>{
 const one=renderHook(()=>useSavedCoursewareSearches('same')),two=renderHook(()=>useSavedCoursewareSearches('same'));
 act(()=>{one.result.current.save(entry,'Practice')});expect(two.result.current.entries).toHaveLength(1);
});
it('rejects malformed conditions, raw paths and inaccessible source identifiers',()=>{
 localStorage.setItem('courseware-saved-searches:bad',JSON.stringify([{id:'bad',name:'Bad',query:'algebra',filters:{...entry.filters,share:'director'}}]));
 const hook=renderHook(()=>useSavedCoursewareSearches('bad'));expect(hook.result.current.entries).toEqual([]);
 act(()=>{expect(hook.result.current.save({...entry,query:'Z:\\file.pdf'},'File')).toBe(false)});
 expect(hook.result.current.entries).toEqual([]);
});
it('reports storage failure without pretending the search was saved',()=>{
 const hook=renderHook(()=>useSavedCoursewareSearches('unavailable'));
 const spy=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('Storage blocked')});
 act(()=>{expect(hook.result.current.save(entry,'Practice')).toBe(false)});
 expect(hook.result.current.entries).toEqual([]);expect(hook.result.current.error).toContain('Could not update');spy.mockRestore();
});
