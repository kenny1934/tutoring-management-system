import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CoursewarePicker, coursewarePageSelection } from './CoursewarePicker';
const files = [
  { path: '[Center]\\First.pdf', pages: '2-4', title: 'First.pdf', pageCount: 4 },
  { path: '[MSA Staff]\\scan\\Second.pdf', pages: '1, 3', title: 'Second.pdf', pageCount: 3 },
];
vi.mock('./CoursewareWorkspace', () => ({ CoursewareWorkspace: ({ onPick, multiple }: { onPick: (selected: typeof files) => void; multiple: boolean }) => <button onClick={() => onPick(multiple ? files : files.slice(0, 1))}>Pick courseware</button> }));
describe('Courseware picker handoff', () => {
  it('preserves each path and page selection for a multi-file lesson draft', () => {
    const select = vi.fn(), multi = vi.fn(), close = vi.fn();
    render(<CoursewarePicker isOpen onClose={close} onSelect={select} multiSelect onMultiSelect={multi} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pick courseware' }));
    expect(multi).toHaveBeenCalledWith([
      { path: files[0].path, pageSelection: { pageStart: 2, pageEnd: 4 } },
      { path: files[1].path, pageSelection: { complexRange: '1, 3' } },
    ]);
    expect(select).not.toHaveBeenCalled(); expect(close).toHaveBeenCalledOnce();
  });
  it('limits the picker to one file when no multi-file callback is provided', () => {
    const select = vi.fn();
    render(<CoursewarePicker isOpen onClose={() => {}} onSelect={select} multiSelect />);
    fireEvent.click(screen.getByRole('button', { name: 'Pick courseware' }));
    expect(select).toHaveBeenCalledOnce();
    expect(select).toHaveBeenCalledWith(files[0].path, { pageStart: 2, pageEnd: 4 });
  });
  it('does not mount a search when closed', () => {
    render(<CoursewarePicker isOpen={false} onClose={() => {}} onSelect={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Pick courseware' })).toBeNull();
  });
  it('preserves a single physical page and a disjoint range', () => {
    expect(coursewarePageSelection('7')).toEqual({ pageStart: 7, pageEnd: 7 });
    expect(coursewarePageSelection('1-3, 7')).toEqual({ complexRange: '1-3, 7' });
  });
});
