import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePdfDarkMode } from "./usePdfDarkMode";

describe("usePdfDarkMode", () => {
  it("is one switch for every viewer, so the worksheet and the answer key always match", () => {
    const worksheet = renderHook(() => usePdfDarkMode());
    const answers = renderHook(() => usePdfDarkMode());
    const before = worksheet.result.current[0];

    act(() => worksheet.result.current[1]());

    expect(worksheet.result.current[0]).toBe(!before);
    expect(answers.result.current[0]).toBe(!before);
    expect(localStorage.getItem("csm_pdf_dark_mode")).toBe(String(!before));
  });
});
