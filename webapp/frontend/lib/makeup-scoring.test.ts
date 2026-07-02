/**
 * Tests for make-up suggestion scoring — Summer lesson-number upgrade.
 *
 * Contract under test (test-first): the scoring logic currently inlined in
 * components/sessions/ScheduleMakeupModal.tsx is extracted to
 * lib/makeup-scoring.ts, exporting:
 *
 *  - ScoringWeights          — existing shape + `sameLesson`
 *  - DEFAULT_WEIGHTS         — unchanged Regular profile, sameLesson: 0
 *  - SUMMER_WEIGHTS          — Summer preset: sameLesson high (100),
 *                              sameSchool 0, sameLang low (5), rest as today
 *  - calculateMakeupScore(breakdown, weights)
 *
 * Scoring rule for the new term (same pattern as grade/lang/school):
 *   score += min(matching_lesson_count * sameLesson, sameLesson * 3)
 * so one same-lesson classmate is worth as much as same-tutor (+100),
 * and a majority-sized group (3+) dominates everything else.
 *
 * The backend guarantees matching_lesson_count is 0 for Regular make-ups
 * and for missed sessions without a lesson number, so the frontend needs
 * no special-casing beyond picking the weight profile.
 */
import { describe, it, expect } from 'vitest';
import {
  calculateMakeupScore,
  DEFAULT_WEIGHTS,
  SUMMER_WEIGHTS,
  type MakeupScoreBreakdown,
} from './makeup-scoring';

function breakdown(overrides: Partial<MakeupScoreBreakdown> = {}): MakeupScoreBreakdown {
  return {
    is_same_tutor: false,
    matching_grade_count: 0,
    matching_school_count: 0,
    matching_lang_count: 0,
    days_away: 30, // neutralises the sooner-date term
    current_students: 8, // neutralises the capacity term
    matching_lesson_count: 0,
    slot_majority_lesson: null,
    majority_lesson_count: 0,
    ...overrides,
  };
}

describe('DEFAULT_WEIGHTS (Regular profile)', () => {
  it('keeps the pre-existing weight values', () => {
    expect(DEFAULT_WEIGHTS).toMatchObject({
      sameTutor: 100,
      sameGrade: 20,
      sameLang: 15,
      sameSchool: 10,
      soonerDate: 30,
      moreCapacity: 10,
    });
  });

  it('gives no lesson boost, so Regular scoring is unchanged', () => {
    const withLessons = calculateMakeupScore(
      breakdown({ matching_lesson_count: 3, slot_majority_lesson: 3, majority_lesson_count: 3 }),
      DEFAULT_WEIGHTS,
    );
    const withoutLessons = calculateMakeupScore(breakdown(), DEFAULT_WEIGHTS);
    expect(withLessons).toBe(withoutLessons);
  });

  it('reproduces the existing formula for a typical Regular slot', () => {
    const score = calculateMakeupScore(
      breakdown({
        is_same_tutor: true,
        matching_grade_count: 2, // 2 * 20 = 40
        matching_lang_count: 1, // 1 * 15 = 15
        matching_school_count: 4, // capped at 10 * 3 = 30
        days_away: 15, // 30 * (15/30) = 15
        current_students: 6, // 10 * 2 = 20
      }),
      DEFAULT_WEIGHTS,
    );
    expect(score).toBe(100 + 40 + 15 + 30 + 15 + 20);
  });
});

describe('SUMMER_WEIGHTS profile', () => {
  it('ignores school entirely', () => {
    const withSchool = calculateMakeupScore(
      breakdown({ matching_school_count: 5 }),
      SUMMER_WEIGHTS,
    );
    expect(withSchool).toBe(calculateMakeupScore(breakdown(), SUMMER_WEIGHTS));
  });

  it('weighs language stream only lightly', () => {
    expect(SUMMER_WEIGHTS.sameLang).toBeGreaterThan(0);
    expect(SUMMER_WEIGHTS.sameLang).toBeLessThan(DEFAULT_WEIGHTS.sameLang);
  });

  it('scores one same-lesson classmate on par with same-tutor', () => {
    const oneLessonMatch = calculateMakeupScore(
      breakdown({ matching_lesson_count: 1 }),
      SUMMER_WEIGHTS,
    );
    const sameTutorOnly = calculateMakeupScore(
      breakdown({ is_same_tutor: true }),
      SUMMER_WEIGHTS,
    );
    expect(oneLessonMatch).toBe(sameTutorOnly);
  });

  it('ranks a majority-same-lesson slot above a same-tutor wrong-lesson slot', () => {
    // The core Summer scenario: student missed lesson 3. Slot A is with her
    // own tutor but teaching lesson 7; slot B is another tutor whose class
    // is mostly on lesson 3.
    const slotA = calculateMakeupScore(
      breakdown({
        is_same_tutor: true,
        matching_grade_count: 3,
        slot_majority_lesson: 7,
        majority_lesson_count: 3,
      }),
      SUMMER_WEIGHTS,
    );
    const slotB = calculateMakeupScore(
      breakdown({
        matching_grade_count: 3,
        matching_lesson_count: 3,
        slot_majority_lesson: 3,
        majority_lesson_count: 3,
      }),
      SUMMER_WEIGHTS,
    );
    expect(slotB).toBeGreaterThan(slotA);
  });

  it('rewards more same-lesson classmates, capped at 3', () => {
    const one = calculateMakeupScore(breakdown({ matching_lesson_count: 1 }), SUMMER_WEIGHTS);
    const two = calculateMakeupScore(breakdown({ matching_lesson_count: 2 }), SUMMER_WEIGHTS);
    const three = calculateMakeupScore(breakdown({ matching_lesson_count: 3 }), SUMMER_WEIGHTS);
    const four = calculateMakeupScore(breakdown({ matching_lesson_count: 4 }), SUMMER_WEIGHTS);
    expect(two).toBeGreaterThan(one);
    expect(three).toBeGreaterThan(two);
    expect(four).toBe(three);
  });

  it('applies no boost when there is nothing to match (missed lesson unset)', () => {
    // Backend sends matching_lesson_count: 0 in that case; majority fields
    // may still describe the slot for the badge without affecting the score.
    const score = calculateMakeupScore(
      breakdown({ slot_majority_lesson: 6, majority_lesson_count: 4 }),
      SUMMER_WEIGHTS,
    );
    expect(score).toBe(calculateMakeupScore(breakdown(), SUMMER_WEIGHTS));
  });
});

describe('backwards compatibility of breakdown payloads', () => {
  it('tolerates payloads without the new lesson fields (old cached responses)', () => {
    const legacy = {
      is_same_tutor: true,
      matching_grade_count: 1,
      matching_school_count: 0,
      matching_lang_count: 0,
      days_away: 30,
      current_students: 8,
    } as MakeupScoreBreakdown;
    expect(() => calculateMakeupScore(legacy, SUMMER_WEIGHTS)).not.toThrow();
    expect(calculateMakeupScore(legacy, SUMMER_WEIGHTS)).toBe(
      calculateMakeupScore(breakdown({ is_same_tutor: true, matching_grade_count: 1 }), SUMMER_WEIGHTS),
    );
  });
});
