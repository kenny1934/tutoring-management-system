import { useState, useEffect, useCallback } from 'react';

interface PuzzleQuestion {
  question: string;
  correctAnswer: string;
  allAnswers: string[];
}

interface CachedPuzzle {
  date: string;
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
const API_URL = 'https://opentdb.com/api.php?amount=1&category=19&difficulty=hard&type=multiple';

// Get today's date as YYYY-MM-DD
function getTodayKey(): string {
  return new Date().toISOString().split('T')[0];
}

// Decode HTML entities from API response
function decodeHTML(html: string): string {
  const txt = document.createElement('textarea');
  txt.innerHTML = html;
  return txt.value;
}

// Shuffle array using Fisher-Yates
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function useDailyPuzzle(): UseDailyPuzzleResult {
  const [question, setQuestion] = useState<PuzzleQuestion | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userAnswer, setUserAnswer] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);

  // Load cached puzzle or fetch new one
  useEffect(() => {
    const todayKey = getTodayKey();

    // Check localStorage for cached puzzle
    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      if (cached) {
        const parsed: CachedPuzzle = JSON.parse(cached);
        if (parsed.date === todayKey) {
          // Use cached question
          setQuestion(parsed.question);
          setUserAnswer(parsed.userAnswer);
          setIsCorrect(parsed.isCorrect);
          setIsLoading(false);
          return;
        }
      }
    } catch {
      // Invalid cache, will fetch new
    }

    // Fetch new puzzle
    async function fetchPuzzle() {
      try {
        setIsLoading(true);
        const response = await fetch(API_URL);

        if (!response.ok) {
          throw new Error('Failed to fetch puzzle');
        }

        const data = await response.json();

        if (data.response_code !== 0 || !data.results || data.results.length === 0) {
          throw new Error('No puzzle available');
        }

        const result = data.results[0];
        const decodedQuestion = decodeHTML(result.question);
        const decodedCorrect = decodeHTML(result.correct_answer);
        const decodedIncorrect = result.incorrect_answers.map(decodeHTML);

        const puzzleQuestion: PuzzleQuestion = {
          question: decodedQuestion,
          correctAnswer: decodedCorrect,
          allAnswers: shuffleArray([decodedCorrect, ...decodedIncorrect]),
        };

        // Cache for today
        const toCache: CachedPuzzle = {
          date: todayKey,
          question: puzzleQuestion,
          userAnswer: null,
          isCorrect: null,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(toCache));

        setQuestion(puzzleQuestion);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load puzzle');
      } finally {
        setIsLoading(false);
      }
    }

    fetchPuzzle();
  }, []);

  // Submit an answer
  const submitAnswer = useCallback((answer: string) => {
    if (!question || userAnswer !== null) return;

    const correct = answer === question.correctAnswer;
    setUserAnswer(answer);
    setIsCorrect(correct);

    // Update cache with answer
    const todayKey = getTodayKey();
    const toCache: CachedPuzzle = {
      date: todayKey,
      question,
      userAnswer: answer,
      isCorrect: correct,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toCache));
  }, [question, userAnswer]);

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
