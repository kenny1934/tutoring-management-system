/**
 * Owns the form-data fields for the summer application form. Used by both
 * the live apply page and the admin config preview so the two surfaces stay
 * structurally in sync — adding a field to SummerApplyFormFields forces both
 * consumers to handle it at the type level.
 *
 * Scope: pure data state that gets submitted. Transient UI (step navigation,
 * buddy code validation status, review consent checkbox, copied toasts, etc.)
 * is intentionally NOT owned here; that lives on the apply page alongside its
 * interactive async handlers.
 */
import { useCallback, useMemo, useState } from "react";
import type { SummerSiblingDeclaration } from "@/types";

export interface SummerApplyFormFields {
  studentName: string;
  school: string;
  grade: string;
  langStream: string;
  isExistingStudent: string;
  currentCenters: string[];
  selectedLocation: string;
  sessionsPerWeek: number;
  pref1Day: string;
  pref1Time: string;
  pref2Day: string;
  pref2Time: string;
  unavailability: string;
  wechatId: string;
  contactPhone: string;
  buddyMode: "none" | "code";
  buddyCode: string;
  buddyReferrerName: string;
  declaredSibling: SummerSiblingDeclaration | null;
}

export interface SummerApplyFormSetters {
  setStudentName: (v: string) => void;
  setSchool: (v: string) => void;
  setGrade: (v: string) => void;
  setLangStream: (v: string) => void;
  setIsExistingStudent: (v: string) => void;
  setCurrentCenters: (updater: (prev: string[]) => string[]) => void;
  setSelectedLocation: (v: string) => void;
  setSessionsPerWeek: (v: number) => void;
  setPref1Day: (v: string) => void;
  setPref1Time: (v: string) => void;
  setPref2Day: (v: string) => void;
  setPref2Time: (v: string) => void;
  setUnavailability: (v: string) => void;
  setWechatId: (v: string) => void;
  setContactPhone: (v: string) => void;
  setBuddyMode: (v: "none" | "code") => void;
  setBuddyCode: (v: string) => void;
  setBuddyReferrerName: (v: string) => void;
  setDeclaredSibling: (v: SummerSiblingDeclaration | null) => void;
}

export const INITIAL_SUMMER_APPLY_FORM: SummerApplyFormFields = {
  studentName: "",
  school: "",
  grade: "",
  langStream: "",
  isExistingStudent: "",
  currentCenters: [],
  selectedLocation: "",
  sessionsPerWeek: 1,
  pref1Day: "",
  pref1Time: "",
  pref2Day: "",
  pref2Time: "",
  unavailability: "",
  wechatId: "",
  contactPhone: "",
  buddyMode: "none",
  buddyCode: "",
  buddyReferrerName: "",
  declaredSibling: null,
};

export interface UseSummerApplyFormStateResult
  extends SummerApplyFormFields,
    SummerApplyFormSetters {
  /** Load a partial draft into state. Unknown keys and shape mismatches are
   *  silently dropped so a stale localStorage blob can't corrupt the form. */
  hydrate: (draft: Record<string, unknown>) => void;
  reset: () => void;
  /** Data-only snapshot for draft serialization. */
  snapshot: () => SummerApplyFormFields;
}

function coerce<K extends keyof SummerApplyFormFields>(
  key: K,
  raw: unknown,
): SummerApplyFormFields[K] | undefined {
  const initial = INITIAL_SUMMER_APPLY_FORM[key];
  if (raw === null && initial === null) return null as SummerApplyFormFields[K];
  if (Array.isArray(initial)) {
    return Array.isArray(raw) ? (raw as SummerApplyFormFields[K]) : undefined;
  }
  if (typeof initial === "object" && initial !== null) {
    return raw && typeof raw === "object"
      ? (raw as SummerApplyFormFields[K])
      : undefined;
  }
  if (key === "buddyMode") {
    return raw === "code" || raw === "none"
      ? (raw as SummerApplyFormFields[K])
      : undefined;
  }
  return typeof raw === typeof initial
    ? (raw as SummerApplyFormFields[K])
    : undefined;
}

export function useSummerApplyFormState(
  initial: Partial<SummerApplyFormFields> = {},
): UseSummerApplyFormStateResult {
  const [state, setState] = useState<SummerApplyFormFields>(() => ({
    ...INITIAL_SUMMER_APPLY_FORM,
    ...initial,
  }));

  const setters = useMemo<SummerApplyFormSetters>(() => ({
    setStudentName: (v) => setState((s) => ({ ...s, studentName: v })),
    setSchool: (v) => setState((s) => ({ ...s, school: v })),
    setGrade: (v) => setState((s) => ({ ...s, grade: v })),
    setLangStream: (v) => setState((s) => ({ ...s, langStream: v })),
    setIsExistingStudent: (v) => setState((s) => ({ ...s, isExistingStudent: v })),
    setCurrentCenters: (updater) =>
      setState((s) => ({ ...s, currentCenters: updater(s.currentCenters) })),
    setSelectedLocation: (v) => setState((s) => ({ ...s, selectedLocation: v })),
    setSessionsPerWeek: (v) => setState((s) => ({ ...s, sessionsPerWeek: v })),
    setPref1Day: (v) => setState((s) => ({ ...s, pref1Day: v })),
    setPref1Time: (v) => setState((s) => ({ ...s, pref1Time: v })),
    setPref2Day: (v) => setState((s) => ({ ...s, pref2Day: v })),
    setPref2Time: (v) => setState((s) => ({ ...s, pref2Time: v })),
    setUnavailability: (v) => setState((s) => ({ ...s, unavailability: v })),
    setWechatId: (v) => setState((s) => ({ ...s, wechatId: v })),
    setContactPhone: (v) => setState((s) => ({ ...s, contactPhone: v })),
    setBuddyMode: (v) => setState((s) => ({ ...s, buddyMode: v })),
    setBuddyCode: (v) => setState((s) => ({ ...s, buddyCode: v })),
    setBuddyReferrerName: (v) => setState((s) => ({ ...s, buddyReferrerName: v })),
    setDeclaredSibling: (v) => setState((s) => ({ ...s, declaredSibling: v })),
  }), []);

  const hydrate = useCallback((draft: Record<string, unknown>) => {
    setState((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(INITIAL_SUMMER_APPLY_FORM) as (keyof SummerApplyFormFields)[]) {
        if (!(key in draft)) continue;
        const coerced = coerce(key, draft[key]);
        if (coerced !== undefined) {
          (next as Record<string, unknown>)[key] = coerced;
        }
      }
      return next;
    });
  }, []);

  const reset = useCallback(() => setState(INITIAL_SUMMER_APPLY_FORM), []);

  return { ...state, ...setters, hydrate, reset, snapshot: () => state };
}

/** Stable no-op setters for the admin preview. Module-level so both the
 *  allocation and identity are stable without a useMemo on the consumer. */
export const FROZEN_SETTERS: SummerApplyFormSetters = {
  setStudentName: () => {},
  setSchool: () => {},
  setGrade: () => {},
  setLangStream: () => {},
  setIsExistingStudent: () => {},
  setCurrentCenters: () => {},
  setSelectedLocation: () => {},
  setSessionsPerWeek: () => {},
  setPref1Day: () => {},
  setPref1Time: () => {},
  setPref2Day: () => {},
  setPref2Time: () => {},
  setUnavailability: () => {},
  setWechatId: () => {},
  setContactPhone: () => {},
  setBuddyMode: () => {},
  setBuddyCode: () => {},
  setBuddyReferrerName: () => {},
  setDeclaredSibling: () => {},
};
