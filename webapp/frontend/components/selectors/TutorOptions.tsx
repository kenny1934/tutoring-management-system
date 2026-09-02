"use client";

import { partitionByBranch, tutorOptionLabel, type TutorBranchFields } from "@/lib/employment";

/**
 * What this needs of a tutor to put them in a list. Structural rather than
 * `Pick<Tutor, ...>` for the same reason lib/employment.ts is: the summer
 * active-tutor endpoint returns a trimmed shape, and both forms have to work
 * without a cast at the call site.
 */
export type TutorOptionFields = TutorBranchFields & {
  id: number;
  tutor_name: string;
};

interface TutorOptionsProps {
  /** Already narrowed to who may be offered, and already in the order to show. */
  tutors: TutorOptionFields[];
  /** The branch being staffed, which decides who counts as visiting. */
  location: string | null | undefined;
  /** Extra text after a name, for a picker that marks one of them out. */
  suffix?: (tutor: TutorOptionFields) => string;
}

/**
 * The options for a native tutor `<select>`, with anybody covering from
 * another branch under their own heading.
 *
 * A dropdown that mixes the two is how somebody hands a lesson to a tutor who
 * is normally at the other branch without noticing, so every picker that can
 * assign work separates them. This was written out by hand in five of them
 * before, which meant five copies of the heading wording to keep in step and
 * nothing to stop a sixth picker forgetting it altogether.
 *
 * Splitting happens here and never changes who is in the list. Whatever the
 * caller decided is offerable is exactly what gets rendered, only laid out.
 */
export function TutorOptions({ tutors, location, suffix }: TutorOptionsProps) {
  const { home, visiting } = partitionByBranch(tutors, location);
  const label = (tutor: TutorOptionFields, text: string) => `${text}${suffix?.(tutor) ?? ""}`;

  return (
    <>
      {home.map((tutor) => (
        <option key={tutor.id} value={tutor.id}>
          {label(tutor, tutor.tutor_name)}
        </option>
      ))}
      {visiting.length > 0 && (
        <optgroup label="Covering from another branch">
          {visiting.map((tutor) => (
            <option key={tutor.id} value={tutor.id}>
              {label(tutor, tutorOptionLabel(tutor, location))}
            </option>
          ))}
        </optgroup>
      )}
    </>
  );
}
