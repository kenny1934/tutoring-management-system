import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ search: vi.fn() }));
vi.mock('@/lib/file-search', async original => ({ ...await original<object>(), searchForFile: h.search }));
vi.mock('@/components/ui/modal', () => ({ Modal: ({ isOpen, children, footer }: {isOpen:boolean;children:React.ReactNode;footer:React.ReactNode}) => isOpen ? <div>{children}{footer}</div> : null }));
import { FileSearchModal } from './file-search-modal';
beforeEach(() => vi.clearAllMocks());
it('keeps same-name dropped files unselected and only adds the location the user chose', async () => {
 const rows = ['One','Two'].map(folder => ({path:`[Center]\\${folder}\\A.pdf`,source:'mckb',match:'exact'}));
 h.search.mockImplementation(async (_:string, __:unknown, ___:unknown, result:(row:unknown)=>void) => { rows.forEach(result); return rows; });
 const selected=vi.fn(); render(<FileSearchModal isOpen onClose={vi.fn()} filenames={['A.pdf']} onFilesSelected={selected}/>);
 await waitFor(()=>expect(screen.getByRole('button',{name:'Add 0 Exercises'})).toBeDisabled());
 fireEvent.click(screen.getByRole('button',{name:/2 results/i}));
 fireEvent.click(screen.getAllByRole('button',{name:/A.pdf/})[0]);
 fireEvent.click(screen.getByRole('button',{name:'Add 1 Exercise'})); expect(selected).toHaveBeenCalledWith([rows[0].path]);
});
it('requires a choice when the filename result set is incomplete', async () => {
 h.search.mockResolvedValue([{path:'[Center]\\A.pdf',source:'mckb',match:'exact',requiresChoice:true}]);
 render(<FileSearchModal isOpen onClose={vi.fn()} filenames={['A.pdf']} />);
 await waitFor(()=>expect(h.search).toHaveBeenCalled()); expect(screen.getByRole('button',{name:'Add 0 Exercises'})).toBeDisabled();
});
