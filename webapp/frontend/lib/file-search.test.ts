import { beforeEach, expect, it, vi } from 'vitest';
const h = vi.hoisted(()=>({search:vi.fn(),folders:vi.fn()}));
vi.mock('./courseware-lookup',()=>({searchCoursewareFiles:h.search,coursewareBasename:(path:string)=>path.split(/[\\/]/).at(-1)}));
vi.mock('./file-system',()=>({getSavedFolders:h.folders,verifyPermission:async()=>true}));
import { searchForFile } from './file-search';
beforeEach(()=>{vi.clearAllMocks();h.folders.mockResolvedValue([]);h.search.mockResolvedValue({files:[{filename:'Division, Remainder.pdf',nas_path:'[Center]\\F4\\Division, Remainder.pdf',share:'center'}],complete:true})});
it('looks up a dropped filename in MCKB and preserves commas and its saved folder',async()=>{
 const results=await searchForFile('Division, Remainder.pdf');
 expect(h.search).toHaveBeenCalledWith('division, remainder.pdf',undefined);
 expect(results).toEqual([{path:'[Center]\\F4\\Division, Remainder.pdf',source:'mckb',match:'exact',folderName:'Center'}]);
 expect(h.folders).not.toHaveBeenCalled();
});
it('returns both same-name locations for the user to choose',async()=>{
 h.search.mockResolvedValue({files:[{filename:'A.pdf',nas_path:'[Center]\\One\\A.pdf',share:'center'},{filename:'A.pdf',nas_path:'[Center]\\Two\\A.pdf',share:'center'}]});
 expect(await searchForFile('A.pdf')).toHaveLength(2);
});
it('stops late remote results from reaching a closed lookup dialog',async()=>{
 let finish!:(value:unknown)=>void;h.search.mockImplementation(()=>new Promise(resolve=>{finish=resolve}));const controller=new AbortController(),row=vi.fn();
 const pending=searchForFile('A.pdf',{signal:controller.signal},undefined,row);controller.abort();finish({files:[{filename:'A.pdf',nas_path:'[Center]\\A.pdf',share:'center'}]});
 await expect(pending).rejects.toMatchObject({name:'AbortError'});expect(row).not.toHaveBeenCalled();
});
