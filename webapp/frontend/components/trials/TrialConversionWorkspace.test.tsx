import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TrialConversionWorkspace } from './TrialConversionWorkspace';

let availableWidth = 1100;
const observers: { notify: () => void; disconnect: ReturnType<typeof vi.fn> }[] = [];
let originalObserver: typeof ResizeObserver;

beforeEach(() => {
  availableWidth = 1100;
  observers.length = 0;
  originalObserver = global.ResizeObserver;
  global.ResizeObserver = class {
    disconnect = vi.fn();
    constructor(notify: ResizeObserverCallback) { observers.push({ notify: () => notify([], this as unknown as ResizeObserver), disconnect: this.disconnect }); }
    observe() {}
    unobserve() {}
  } as unknown as typeof ResizeObserver;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return { width: this.hasAttribute('data-trial-workspace') ? availableWidth : 0, height: 800, x: 0, y: 0, top: 0, left: 0, bottom: 800, right: availableWidth, toJSON: () => ({}) };
  });
});
afterEach(() => { document.querySelectorAll('[data-app-frame]').forEach(element => element.remove()); global.ResizeObserver = originalObserver; vi.restoreAllMocks(); });

function shell() {
  const host = document.createElement('div'); host.setAttribute('data-app-frame', '');
  const main = document.createElement('main'); main.id = 'main-content'; host.append(main); document.body.append(host);
  return { host, main };
}
function resize(width: number) {
  act(() => { availableWidth = width; observers.forEach(observer => observer.notify()); });
}
function workspace(props: Partial<React.ComponentProps<typeof TrialConversionWorkspace>> = {}) {
  return <TrialConversionWorkspace converting tab="create" onTabChange={vi.fn()} onClose={vi.fn()}
    detail={() => <p>Original trial details</p>} create={<input aria-label="Actual first lesson" defaultValue="2026-11-13" />} {...props} />;
}

describe('trial conversion workspace', () => {
  it('anchors to the live app frame and chooses tabs from its available width', async () => {
    const { host } = shell(); availableWidth = 800;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1600 });
    const view = render(workspace());
    const overlay = host.querySelector('[data-trial-workspace]')!;
    expect(overlay.parentElement).toBe(host);
    expect(overlay).toHaveClass('absolute');
    expect(overlay).not.toHaveClass('fixed');
    expect(overlay).toHaveAttribute('data-workspace-layout', 'tabs');
    expect(screen.getByRole('tab', { name: 'Convert to Regular' })).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(screen.getByLabelText('Actual first lesson')).toBeVisible());
    view.unmount(); host.remove();
  });

  it('retains the same edited conversion pane through repeated sidebar width changes', () => {
    const { host } = shell();
    const view = render(workspace());
    const input = screen.getByLabelText('Actual first lesson');
    fireEvent.change(input, { target: { value: '2026-11-20' } });
    const overlay = host.querySelector('[data-trial-workspace]')!;
    expect(overlay).toHaveAttribute('data-workspace-layout', 'side-by-side');
    for (const width of [1040, 960, 920, 800, 720, 920, 960, 1100, 800, 1100]) {
      resize(width);
      expect(screen.getByLabelText('Actual first lesson')).toBe(input);
      expect(input).toHaveValue('2026-11-20');
      expect(overlay).toHaveAttribute('data-workspace-layout', width >= 960 ? 'side-by-side' : 'tabs');
    }
    expect(overlay.querySelector('[data-workspace-frame]')).toHaveClass('w-full', 'min-w-0');
    expect(overlay.querySelector('[data-workspace-pane="create"]')).toHaveClass('min-w-0', 'flex-1');
    view.unmount(); expect(observers[0].disconnect).toHaveBeenCalled(); host.remove();
  });

  it('keeps both panes mounted when switching narrow-screen tabs', async () => {
    const { host } = shell(); availableWidth = 700;
    const view = render(workspace());
    const input = screen.getByLabelText('Actual first lesson'); fireEvent.change(input, { target: { value: '2026-11-27' } });
    await waitFor(() => expect(input).toBeVisible());
    view.rerender(workspace({ tab: 'detail' }));
    expect(input).not.toBeVisible();
    expect(screen.getByText('Original trial details')).toBeVisible();
    view.rerender(workspace({ tab: 'create' }));
    expect(screen.getByLabelText('Actual first lesson')).toBe(input);
    expect(input).toHaveValue('2026-11-27');
    view.unmount(); host.remove();
  });

  it('guards the parent backdrop and tab switches while creation is in flight', () => {
    const { host } = shell(); availableWidth = 700;
    const onClose = vi.fn(), onTabChange = vi.fn();
    const view = render(workspace({ busy: true, onClose, onTabChange }));
    const backdrop = host.querySelector('[data-trial-workspace] > div')!;
    fireEvent.click(backdrop); fireEvent.click(screen.getByRole('tab', { name: 'Trial details' }));
    expect(onClose).not.toHaveBeenCalled(); expect(onTabChange).not.toHaveBeenCalled();
    expect(screen.getByRole('tab', { name: 'Trial details' })).toBeDisabled();
    view.rerender(workspace({ busy: false, onClose, onTabChange }));
    fireEvent.click(backdrop); fireEvent.click(screen.getByRole('tab', { name: 'Trial details' }));
    expect(onClose).toHaveBeenCalledOnce(); expect(onTabChange).toHaveBeenCalledWith('detail');
    view.unmount(); host.remove();
  });

  it('keeps the single original detail centred without a conversion panel', async () => {
    const { host } = shell();
    const view = render(workspace({ converting: false }));
    expect(host.querySelector('[data-workspace-frame]')).toHaveClass('max-w-[32rem]');
    expect(host.querySelector('[data-workspace-pane="create"]')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Original trial details')).toBeVisible());
    view.unmount(); host.remove();
  });
});
