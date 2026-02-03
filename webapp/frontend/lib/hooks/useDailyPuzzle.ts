import { useState, useEffect, useCallback } from 'react';
import { MATH_PUZZLES, type MathPuzzle } from '@/lib/data/math-puzzles';
import {
  getSeenPuzzles,
  getSeenPuzzlesStorage,
  markPuzzleSeen,
  resetSeenPuzzles,
} from '@/lib/puzzle-storage';

interface PuzzleQuestion {
  question: string;
  correctAnswer: string;
  allAnswers: string[];
}

interface CachedPuzzle {
  date: string;
  puzzleId: string;
  question: PuzzleQuestion;
  userAnswer: string | null;
  isCorrect: boolean | null;
}

interface UseDailyPuzzleResult {
  question: PuzzleQuestion | null;
  isLoading: boolean;
  error: string | null;
  userAnswer: string | null;
  isCorrect: boolean | null;
  answeredToday: boolean;
  submitAnswer: (answer: string) => void;
}

const STORAGE_KEY = 'daily-puzzle';

// Get today's date as YYYY-MM-DD
function getTodayKey(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Generate a deterministic hash from a date string
 * Same date always produces the same hash
 */
function hashDate(dateStr: string): number {
  const [year, month, day] = dateStr.split('-').map(Number);
  return (year * 10000 + month * 100 + day) * 31337;
}

/**
 * Shuffle an array deterministically using a seed
 * Ensures all users see the same answer order for the same day
 */
function seededShuffle<T>(array: T[], seed: number): T[] {
  const shuffled = [...array];
  let currentSeed = seed;

  const random = () => {
    currentSeed = (currentSeed * 9301 + 49297) % 233280;
    return currentSeed / 233280;
  };

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
}

/**
 * Select a puzzle for the given date
 * Uses deterministic selection so all users see the same puzzle each day
 * Filters out already-seen puzzles to prevent repetition
 */
function selectPuzzleForDate(dateStr: string): MathPuzzle {
  const seenIds = getSeenPuzzles();
  let availablePuzzles = MATH_PUZZLES.filter((p) => !seenIds.has(p.id));

  if (availablePuzzles.length === 0) {
    resetSeenPuzzles(true);
    availablePuzzles = [...MATH_PUZZLES];
  }

  const storage = getSeenPuzzlesStorage();
  const dateHash = hashDate(dateStr) + storage.cycleCount * 7919;
  const index = Math.abs(dateHash) % availablePuzzles.length;

  return availablePuzzles[index];
}

export function useDailyPuzzle(): UseDailyPuzzleResult {
  const [question, setQuestion] = useState<PuzzleQuestion | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userAnswer, setUserAnswer] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);

  useEffect(() => {
    const todayKey = getTodayKey();

    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      if (cached) {
        const parsed: CachedPuzzle = JSON.parse(cached);
        if (parsed.date === todayKey) {
          setQuestion(parsed.question);
          setUserAnswer(parsed.userAnswer);
          setIsCorrect(parsed.isCorrect);
          setIsLoading(false);
          return;
        }
      }
    } catch {
      // Invalid cache, will select new puzzle
    }

    try {
      const puzzle = selectPuzzleForDate(todayKey);
      const dateHash = hashDate(todayKey);

      const puzzleQuestion: PuzzleQuestion = {
        question: puzzle.question,
        correctAnswer: puzzle.correctAnswer,
        allAnswers: seededShuffle(
          [puzzle.correctAnswer, ...puzzle.incorrectAnswers],
          dateHash
        ),
      };

      const toCache: CachedPuzzle = {
        date: todayKey,
        puzzleId: puzzle.id,
        question: puzzleQuestion,
        userAnswer: null,
        isCorrect: null,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toCache));

      markPuzzleSeen(puzzle.id);

      setQuestion(puzzleQuestion);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load puzzle');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const submitAnswer = useCallback(
    (answer: string) => {
      if (!question || userAnswer !== null) return;

      const correct = answer === question.correctAnswer;
      setUserAnswer(answer);
      setIsCorrect(correct);

      const todayKey = getTodayKey();
      try {
        const cached = localStorage.getItem(STORAGE_KEY);
        if (cached) {
          const parsed: CachedPuzzle = JSON.parse(cached);
          parsed.userAnswer = answer;
          parsed.isCorrect = correct;
          localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
        }
      } catch {
        // Ignore storage errors
      }
    },
    [question, userAnswer]
  );

  return {
    question,
    isLoading,
    error,
    userAnswer,
    isCorrect,
    answeredToday: userAnswer !== null,
    submitAnswer,
  };
}
