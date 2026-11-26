import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SearchProgress } from './SearchProgress';
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
it('avoids a flash for a fast search and gives a clear status for a slower one', () => {
 const view=render(<SearchProgress busy requestKey="one" label="Searching courseware…" placeholders={3}/>);
 act(()=>vi.advanceTimersByTime(249));expect(screen.queryByRole('status')).toBeNull();
 act(()=>vi.advanceTimersByTime(1));expect(screen.getByRole('status')).toHaveTextContent('Searching courseware…');
 expect(view.container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();expect(view.container.querySelector('[aria-valuenow]')).toBeNull();
 act(()=>vi.advanceTimersByTime(4750));expect(screen.getByRole('status')).toHaveTextContent('Still searching courseware…');expect(screen.getByText('This is taking longer than usual.')).toBeVisible();
 view.rerender(<SearchProgress busy={false} requestKey="one" label="Searching courseware…"/>);expect(screen.queryByRole('status')).toBeNull();
});
it('does not carry a previous query’s long-wait state into a new search', () => {
 const view=render(<SearchProgress busy requestKey="one" label="Searching records…"/>);
 act(()=>vi.advanceTimersByTime(6000));expect(screen.getByRole('status')).toHaveTextContent('Still searching records…');
 view.rerender(<SearchProgress busy requestKey="two" label="Searching records…"/>);expect(screen.queryByRole('status')).toBeNull();
 act(()=>vi.advanceTimersByTime(250));expect(screen.getByRole('status')).toHaveTextContent('Searching records…');expect(screen.queryByText('This is taking longer than usual.')).toBeNull();
});
it('clears pending feedback when the search closes', () => {
 const view=render(<SearchProgress busy requestKey="one" label="Searching records…"/>);
 view.rerender(<SearchProgress busy={false} requestKey="one" label="Searching records…"/>);
 act(()=>vi.advanceTimersByTime(10000));expect(screen.queryByRole('status')).toBeNull();expect(vi.getTimerCount()).toBe(0);
});
