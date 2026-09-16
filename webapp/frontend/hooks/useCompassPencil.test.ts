import { describe, it, expect, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useCompassPencil, useCompassPencilKey } from "./useCompassPencil";

describe("useCompassPencil", () => {
  it("gives the key to the pair shown or touched last, and knows when none is out", () => {
    const worksheet = vi.fn();
    const draft = vi.fn();
    const { result: key } = renderHook(() => useCompassPencilKey());
    expect(key.current.out).toBe(false);

    // The pair shown last has the key.
    const onWorksheet = renderHook(() => useCompassPencil(worksheet));
    const onDraft = renderHook(() => useCompassPencil(draft));
    expect(key.current.out).toBe(true);
    act(() => key.current.toggle());
    expect(draft).toHaveBeenCalledTimes(1);
    expect(worksheet).not.toHaveBeenCalled();

    // A finger on the worksheet's pair takes it back.
    act(() => onWorksheet.result.current());
    act(() => key.current.toggle());
    expect(worksheet).toHaveBeenCalledTimes(1);

    // Once that pair is hidden, the key goes to the pair that's left.
    onWorksheet.unmount();
    act(() => key.current.toggle());
    expect(draft).toHaveBeenCalledTimes(2);

    onDraft.unmount();
    expect(key.current.out).toBe(false);
    act(() => key.current.toggle());
    expect(draft).toHaveBeenCalledTimes(2);
  });

  it("calls the pair's newest toggle, not the one it was shown with", () => {
    const stale = vi.fn();
    const fresh = vi.fn();
    const pair = renderHook(({ toggle }) => useCompassPencil(toggle), { initialProps: { toggle: stale } });
    pair.rerender({ toggle: fresh });
    const { result: key } = renderHook(() => useCompassPencilKey());
    act(() => key.current.toggle());
    expect(fresh).toHaveBeenCalledTimes(1);
    expect(stale).not.toHaveBeenCalled();
    pair.unmount();
  });
});
