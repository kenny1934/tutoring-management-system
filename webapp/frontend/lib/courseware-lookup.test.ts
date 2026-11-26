import { beforeEach, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('./api', () => ({ fetchAPI: h.fetch }));
import { resolveCoursewareFile, searchCoursewareFiles } from './courseware-lookup';
const file = (id=1, path='[Center]\\F1\\Algebra OR NOT.pdf') => ({ file_id:id, filename:'Algebra OR NOT.pdf', nas_path:path, rel_path:'F1/Algebra OR NOT.pdf', share:'center', ext:'.pdf', page_count:4, duplicate_count:0, duplicate_locations:[] });
beforeEach(()=>{h.fetch.mockReset();h.fetch.mockResolvedValue({total:1,results:[file()]})});
it('searches filenames as a literal phrase and forwards cancellation without using Paperless syntax',async()=>{
 const controller=new AbortController();const result=await searchCoursewareFiles('Algebra OR NOT.pdf',controller.signal);
 expect(result.files).toHaveLength(1);
 expect(h.fetch).toHaveBeenCalledWith('/materials/search',expect.objectContaining({signal:controller.signal,body:JSON.stringify({q:'',refine:{search_in:'filename',exact_phrase:'Algebra OR NOT.pdf'},page_size:50})}));
});
it('resolves a known path exactly and does not substitute a similarly named file when it is missing',async()=>{
 h.fetch.mockRejectedValue({status:404});await expect(resolveCoursewareFile('[Center]\\F1\\Algebra.pdf')).rejects.toMatchObject({status:404});
 expect(h.fetch).toHaveBeenCalledOnce();expect(h.fetch.mock.calls[0][0]).toBe('/materials/resolve');
});
it('keeps duplicate NAS locations as explicit choices and refuses automatic filename resolution',async()=>{
 const first=file();h.fetch.mockResolvedValue({total:1,results:[{...first,duplicate_count:1,duplicate_locations:[{share:'developer',nas_path:'[Courseware Developer 中學]\\F1\\Algebra OR NOT.pdf',rel_path:'F1/Algebra OR NOT.pdf'}]}]});
 expect((await searchCoursewareFiles(first.filename)).files).toHaveLength(2);
 await expect(resolveCoursewareFile(first.filename)).rejects.toMatchObject({status:409});
});
it('refuses an apparently unique match when additional matches were not returned',async()=>{
 h.fetch.mockResolvedValue({total:60,results:[file()]});await expect(resolveCoursewareFile(file().filename)).rejects.toMatchObject({status:409});
});
it('retries a legacy hash title using the real filename only after checking the literal title',async()=>{
 h.fetch.mockResolvedValueOnce({total:0,results:[]}).mockResolvedValueOnce({total:1,results:[file()]});
 expect(await resolveCoursewareFile('[4CEC9706]__Algebra OR NOT.pdf')).toMatchObject({file_id:1});
 expect(JSON.parse(h.fetch.mock.calls[0][1].body).refine.exact_phrase).toBe('[4CEC9706]__Algebra OR NOT.pdf');
});
it('does not transform a literal hash-prefixed file that actually exists',async()=>{
 h.fetch.mockResolvedValue({total:1,results:[{...file(),filename:'[4CEC9706]__Algebra.pdf'}]});
 expect(await resolveCoursewareFile('[4CEC9706]__Algebra.pdf')).toMatchObject({file_id:1});expect(h.fetch).toHaveBeenCalledOnce();
});
it('never turns an access denial into another-source lookup',async()=>{
 h.fetch.mockRejectedValue({status:403});await expect(resolveCoursewareFile('[Center]\\Private.pdf')).rejects.toMatchObject({status:403});expect(h.fetch).toHaveBeenCalledOnce();
});
