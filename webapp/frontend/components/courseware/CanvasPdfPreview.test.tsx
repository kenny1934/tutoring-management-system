import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { CanvasPdfPreview } from './CanvasPdfPreview';
const h = vi.hoisted(() => ({ viewer: vi.fn() }));
vi.mock('next/dynamic', () => ({ default: () => (props: {renderLoading: () => React.ReactNode}) => { h.viewer(props); return props.renderLoading(); } }));
beforeEach(() => h.viewer.mockClear());
it('uses the same loading presentation before and after PDF bytes arrive', () => {
 const view=render(<CanvasPdfPreview title="Worksheet A" />);
 const loading=screen.getByRole('status').parentElement!.outerHTML;
 view.rerender(<CanvasPdfPreview title="Worksheet A" data={new ArrayBuffer(10)} />);
 expect(screen.getByRole('status').parentElement!.outerHTML).toBe(loading);
 expect(screen.queryByText('Worksheet A')).toBeNull();
 expect(h.viewer).toHaveBeenCalled();
});
it('keeps external source errors on the shared retry surface without starting the renderer', () => {
 const retry=vi.fn();render(<CanvasPdfPreview title="Worksheet A" error="The courseware service is unavailable." onRetry={retry}/>);
 expect(screen.getByRole('alert')).toHaveTextContent('PDF unavailable');expect(screen.getByText('Worksheet A')).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'Retry preview'}));expect(retry).toHaveBeenCalledOnce();expect(h.viewer).not.toHaveBeenCalled();
});
