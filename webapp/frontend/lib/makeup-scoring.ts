// Make-up slot suggestion scoring, extracted from ScheduleMakeupModal so it
// can be unit-tested. The backend sends raw compatibility counts; the score
// is computed here with user-adjustable weights so re-sorting is instant.
import type { MakeupScoreBreakdown } from '@/types';

export interface ScoringWeights {
  sameTutor: number;
  sameGrade: number;
  sameSchool: number;
  sameLang: number;
  soonerDate: number;
  moreCapacity: number;
  sameLesson: number;
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  sameTutor: 100,
  sameGrade: 20,      // Per matching student, capped at ~60
  sameLang: 15,       // Per matching student, capped at ~45 (priority: grade > lang > school)
  sameSchool: 10,     // Per matching student, capped at ~30
  soonerDate: 30,     // Scaled by proximity (0-30 days)
  moreCapacity: 10,   // Per empty spot
  sameLesson: 0,      // Regular sessions have no lesson numbers to match
};

// Summer profile: landing on the missed lesson's material dominates; school
// is irrelevant during summer and language stream only matters a little.
export const SUMMER_WEIGHTS: ScoringWeights = {
  ...DEFAULT_WEIGHTS,
  sameLang: 5,
  sameSchool: 0,
  sameLesson: 100,    // Per same-lesson classmate, capped at ~300
};

// Calculate score based on raw data and user-adjustable weights
export function calculateMakeupScore(breakdown: MakeupScoreBreakdown, weights: ScoringWeights): number {
  let score = 0;
  if (breakdown.is_same_tutor) score += weights.sameTutor;
  // Caps scale proportionally: weight * 3 (e.g., default 20 * 3 = 60)
  score += Math.min(breakdown.matching_grade_count * weights.sameGrade, weights.sameGrade * 3);
  score += Math.min(breakdown.matching_lang_count * weights.sameLang, weights.sameLang * 3);
  score += Math.min(breakdown.matching_school_count * weights.sameSchool, weights.sameSchool * 3);
  score += Math.min((breakdown.matching_lesson_count ?? 0) * weights.sameLesson, weights.sameLesson * 3);
  score += weights.soonerDate * Math.max(0, (30 - breakdown.days_away) / 30);
  score += weights.moreCapacity * (8 - breakdown.current_students);
  return Math.round(score);
}
