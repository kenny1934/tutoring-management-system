/**
 * Owns the form-data fields for the regular course application form. Used by
 * both the live apply page and the admin config preview so the two surfaces
 * stay structurally in sync — adding a field to RegularApplyFormFields forces
 * both consumers to handle it at the type level.
 *
 * Scope: pure data state that gets submitted. Transient UI (step navigation,
 * consent checkbox, copied toasts, etc.) is intentionally NOT owned here;
 * that lives on the apply page alongside its interactive handlers.
 *
 * Mirror of useSummerApplyFormState minus buddy/sibling, sessions-per-week,
 * preference pair 3/4, and unavailability.
 */
import { useCallback, useMemo, useState } from "react";

export interface RegularApplyFormFields {
  studentName: string;
  school: string;
  grade: string;
  langStream: string;
  isExistingStudent: string;
  currentCenters: string[];
  selectedLocation: string;
  pref1Day: string;
  pref1Time: string;
  pref2Day: string;
  pref2Time: string;
  wechatId: string;
  contactPhone: string;
}

export interface RegularApplyFormSetters {
  setStudentName: (v: string) => void;
  setSchool: (v: string) => void;
  setGrade: (v: string) => void;
  setLangStream: (v: string) => void;
  setIsExistingStudent: (v: string) => void;
  setCurrentCenters: (updater: (prev: string[]) => string[]) => void;
  setSelectedLocation: (v: string) => void;
  setPref1Day: (v: string) => void;
  setPref1Time: (v: string) => void;
  setPref2Day: (v: string) => void;
  setPref2Time: (v: string) => void;
  setWechatId: (v: string) => void;
  setContactPhone: (v: string) => void;
}

export const INITIAL_REGULAR_APPLY_FORM: RegularApplyFormFields = {
  studentName: "",
  school: "",
  grade: "",
  langStream: "",
  isExistingStudent: "",
  currentCenters: [],
  selectedLocation: "",
  pref1Day: "",
  pref1Time: "",
  pref2Day: "",
  pref2Time: "",
  wechatId: "",
  contactPhone: "",
};

export interface UseRegularApplyFormStateResult
  extends RegularApplyFormFields,
    RegularApplyFormSetters {
  /** Load a partial draft into state. Unknown keys and shape mismatches are
   *  silently dropped so a stale localStorage blob can't corrupt the form. */
  hydrate: (draft: Record<string, unknown>) => void;
  reset: () => void;
  /** Data-only snapshot for draft serialization. */
  snapshot: () => RegularApplyFormFields;
}

function coerce<K extends keyof RegularApplyFormFields>(
  key: K,
  raw: unknown,
): RegularApplyFormFields[K] | undefined {
  const initial = INITIAL_REGULAR_APPLY_FORM[key];
  if (Array.isArray(initial)) {
    return Array.isArray(raw) ? (raw as RegularApplyFormFields[K]) : undefined;
  }
  return typeof raw === typeof initial
    ? (raw as RegularApplyFormFields[K])
    : undefined;
}

export function useRegularApplyFormState(
  initial: Partial<RegularApplyFormFields> = {},
): UseRegularApplyFormStateResult {
  const [state, setState] = useState<RegularApplyFormFields>(() => ({
    ...INITIAL_REGULAR_APPLY_FORM,
    ...initial,
  }));

  const setters = useMemo<RegularApplyFormSetters>(() => ({
    setStudentName: (v) => setState((s) => ({ ...s, studentName: v })),
    setSchool: (v) => setState((s) => ({ ...s, school: v })),
    setGrade: (v) => setState((s) => ({ ...s, grade: v })),
    setLangStream: (v) => setState((s) => ({ ...s, langStream: v })),
    setIsExistingStudent: (v) => setState((s) => ({ ...s, isExistingStudent: v })),
    setCurrentCenters: (updater) =>
      setState((s) => ({ ...s, currentCenters: updater(s.currentCenters) })),
    setSelectedLocation: (v) => setState((s) => ({ ...s, selectedLocation: v })),
    setPref1Day: (v) => setState((s) => ({ ...s, pref1Day: v })),
    setPref1Time: (v) => setState((s) => ({ ...s, pref1Time: v })),
    setPref2Day: (v) => setState((s) => ({ ...s, pref2Day: v })),
    setPref2Time: (v) => setState((s) => ({ ...s, pref2Time: v })),
    setWechatId: (v) => setState((s) => ({ ...s, wechatId: v })),
    setContactPhone: (v) => setState((s) => ({ ...s, contactPhone: v })),
  }), []);

  const hydrate = useCallback((draft: Record<string, unknown>) => {
    setState((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(INITIAL_REGULAR_APPLY_FORM) as (keyof RegularApplyFormFields)[]) {
        if (!(key in draft)) continue;
        const coerced = coerce(key, draft[key]);
        if (coerced !== undefined) {
          (next as Record<string, unknown>)[key] = coerced;
        }
      }
      return next;
    });
  }, []);

  const reset = useCallback(() => setState(INITIAL_REGULAR_APPLY_FORM), []);

  return { ...state, ...setters, hydrate, reset, snapshot: () => state };
}

/** Stable no-op setters for the admin preview. Module-level so both the
 *  allocation and identity are stable without a useMemo on the consumer. */
export const FROZEN_SETTERS: RegularApplyFormSetters = {
  setStudentName: () => {},
  setSchool: () => {},
  setGrade: () => {},
  setLangStream: () => {},
  setIsExistingStudent: () => {},
  setCurrentCenters: () => {},
  setSelectedLocation: () => {},
  setPref1Day: () => {},
  setPref1Time: () => {},
  setPref2Day: () => {},
  setPref2Time: () => {},
  setWechatId: () => {},
  setContactPhone: () => {},
};
