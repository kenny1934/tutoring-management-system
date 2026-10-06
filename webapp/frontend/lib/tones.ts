/**
 * The five tones a status can take, and the classes for each. Use these for
 * anything that tells the reader how things stand (a count that needs
 * attention, a state chip, a warning) instead of picking a Tailwind colour on
 * the spot. Keeping colour to these five is what lets it carry meaning: red
 * only ever means something has gone wrong.
 *
 * - `soft` is a tinted chip: a pale fill with dark text of the same hue. Its
 *   edge is an inset ring, so it takes no space and swapping it in never
 *   changes a layout. Prefer it for anything with words in it.
 * - `solid` is a strong fill with white text, for small count badges that
 *   have to stand out. Every solid fill clears 4.5:1 against white.
 * - `text` colours words or an icon sitting on an ordinary surface.
 *
 * The class strings are written out in full because Tailwind only generates
 * classes it can find spelled out in the source.
 */
export type Tone = "neutral" | "info" | "success" | "warning" | "danger";

interface ToneClasses {
  soft: string;
  solid: string;
  text: string;
}

export const TONES: Record<Tone, ToneClasses> = {
  neutral: {
    soft: "bg-gray-50 text-gray-700 ring-1 ring-inset ring-gray-200 dark:bg-gray-900/40 dark:text-gray-300 dark:ring-gray-700/60",
    solid: "bg-gray-600 text-white",
    text: "text-gray-600 dark:text-gray-400",
  },
  info: {
    soft: "bg-blue-50 text-blue-800 ring-1 ring-inset ring-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:ring-blue-800/60",
    solid: "bg-blue-600 text-white",
    text: "text-blue-700 dark:text-blue-400",
  },
  success: {
    soft: "bg-green-50 text-green-800 ring-1 ring-inset ring-green-200 dark:bg-green-900/40 dark:text-green-300 dark:ring-green-800/60",
    solid: "bg-green-700 text-white",
    text: "text-green-700 dark:text-green-400",
  },
  warning: {
    soft: "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:ring-amber-800/60",
    solid: "bg-amber-700 text-white",
    text: "text-amber-700 dark:text-amber-400",
  },
  danger: {
    soft: "bg-red-50 text-red-800 ring-1 ring-inset ring-red-200 dark:bg-red-900/40 dark:text-red-300 dark:ring-red-800/60",
    solid: "bg-red-600 text-white",
    text: "text-red-700 dark:text-red-400",
  },
};
