"use client";

import type { CSSProperties, ReactNode } from "react";
import { Minus, Plus } from "lucide-react";

interface StepperProps {
  /** What the box shows, which is whatever has been typed into it so far. */
  text: string;
  onTextChange: (text: string) => void;
  /** The − button. */
  onLess: () => void;
  /** The + button. */
  onMore: () => void;
  /** Greys out the − button, such as at the lowest the value can go. */
  lessDisabled?: boolean;
  /** Greys out the + button, such as at the highest the value can go. */
  moreDisabled?: boolean;
  /** The box losing focus, which is where what was typed is usually settled. */
  onBlur: () => void;
  onEnter: () => void;
  onEscape?: () => void;
  lessLabel: string;
  moreLabel: string;
  boxLabel: string;
  /** Anything written after the box, such as the compasses' "cm". */
  unit?: ReactNode;
  buttonClassName: string;
  buttonStyle?: CSSProperties;
  inputClassName: string;
}

/**
 * A − button, a box to type a value into, and a + button, for setting a value
 * exactly with a finger at the board. The compasses' width and the settings
 * of the Draft's axes both use it. It keeps no value of its own. Whoever uses
 * it decides how far a button steps, what a typed value turns into, and when
 * it's settled, and it just lays the three parts out in a row inside
 * whatever holds it.
 */
export function Stepper({
  text, onTextChange, onLess, onMore, lessDisabled, moreDisabled, onBlur, onEnter, onEscape,
  lessLabel, moreLabel, boxLabel, unit, buttonClassName, buttonStyle, inputClassName,
}: StepperProps) {
  return (
    <>
      <button
        type="button"
        aria-label={lessLabel}
        title={lessLabel}
        onClick={onLess}
        disabled={lessDisabled}
        className={buttonClassName}
        style={buttonStyle}
      >
        <Minus className="h-1/2 w-1/2" />
      </button>
      <input
        aria-label={boxLabel}
        inputMode="decimal"
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        onBlur={onBlur}
        onKeyDown={(e) => {
          if (e.key === "Enter") onEnter();
          else if (e.key === "Escape") onEscape?.();
        }}
        className={inputClassName}
      />
      {unit}
      <button
        type="button"
        aria-label={moreLabel}
        title={moreLabel}
        onClick={onMore}
        disabled={moreDisabled}
        className={buttonClassName}
        style={buttonStyle}
      >
        <Plus className="h-1/2 w-1/2" />
      </button>
    </>
  );
}
