"use client";

import { SessionActionButtons } from "@/components/ui/action-buttons";
import { StarRating, parseStarRating } from "@/components/ui/star-rating";
import { useAuth } from "@/contexts/AuthContext";
import { getExerciseDisplayName, parseExerciseRemarks } from "@/lib/exercise-utils";
import type { Session } from "@/types";

export function SessionSearchContent({ session, onChanged }: { session: Session; onChanged: () => void }) {
  const { user, impersonatedTutor, isImpersonating } = useAuth();
  return <div className="space-y-3 border-t border-line pt-3">
    <SessionActionButtons session={session} showLabels disablePushRight
      currentTutorId={isImpersonating ? impersonatedTutor?.id : user?.id} onAction={onChanged} />
    {([['CW', 'Classwork'], ['HW', 'Homework']] as const).map(([short, long]) => {
      const exercises = session.exercises?.filter(ex => ex.exercise_type === short || ex.exercise_type === long) ?? [];
      return <section key={short} aria-label={long} className="text-xs">
        <h3 className="font-medium text-ink-heading mb-1">{short}</h3>
        {exercises.length ? <ul className="space-y-1 text-ink-heading">{exercises.map(ex => {
          const { complexPages } = parseExerciseRemarks(ex.remarks);
          const pages = complexPages || (ex.page_start ? `${ex.page_start}${ex.page_end && ex.page_end !== ex.page_start ? `–${ex.page_end}` : ''}` : '');
          return <li key={ex.id} className="break-words">{getExerciseDisplayName(ex)}{pages && <span className="text-ink-subtle"> (p{pages})</span>}</li>;
        })}</ul> : <p className="text-ink-subtle">None assigned</p>}
      </section>;
    })}
    <div className="flex items-center gap-2 text-xs text-ink-heading"><span>Rating</span>{session.performance_rating
      ? <StarRating rating={parseStarRating(session.performance_rating)} size="sm" /> : <span className="text-ink-subtle">Not rated</span>}</div>
    {session.notes && <section aria-label="Comment" className="text-xs"><h3 className="font-medium text-ink-heading mb-1">Comment</h3><p className="whitespace-pre-wrap break-words text-ink-heading">{session.notes}</p></section>}
  </div>;
}
