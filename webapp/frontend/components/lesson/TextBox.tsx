"use client";

import { useEffect, useRef } from "react";
import type { Vec } from "@/lib/stroke-select";
import { TEXT_FONT, TEXT_LINE_HEIGHT, TEXT_MAX_LENGTH, textWidth, wrapText, wrapWidth } from "@/lib/text-ink";

// The symbols a proof needs that a keyboard doesn't have, with what a screen reader calls each one.
const SYMBOLS: readonly [symbol: string, name: string][] = [
  ["∠", "Angle"], ["△", "Triangle"], ["⊥", "Perpendicular"], ["//", "Parallel"], ["≅", "Congruent"],
  ["~", "Similar"], ["°", "Degrees"], ["∴", "Therefore"], ["∵", "Because"],
];
const PLACEHOLDER = "Type, then press Enter";
// The row of symbols is this tall on screen, gap included, whatever the zoom.
const ROW_ROOM = 64;

interface TextBoxProps {
  /** Where the text starts: the left edge of its first line, and the middle of that line, in page units. */
  at: Vec;
  /** The size of the writing, in page units. */
  size: number;
  color: string;
  italic: boolean;
  text: string;
  /** The page's width, which the text wraps before. */
  width: number;
  /** How much the page is scaled on screen. The row of symbols is divided by it, so it stays finger-sized. */
  uiScale: number;
  onChange: (text: string) => void;
  /** Put the text on the page. */
  onDone: () => void;
  /** Close the box and forget what was typed. */
  onCancel: () => void;
}

/**
 * The box the Text tool types in. It sits where the text will go on the page,
 * in the font, size and colour the text will have there, and its lines wrap
 * where they will on the page, so what the tutor sees while typing is what
 * gets placed. A row of symbols that a keyboard doesn't have, such as ∠ and
 * △, sits above it, or below it near the top of the page.
 *
 * Enter puts the text on the page, and Shift+Enter starts a new line. An Enter
 * that confirms the characters Windows' Chinese input is offering doesn't
 * count. Escape closes the box and forgets what was typed. It holds up to
 * 1,000 characters, far more than a board needs and well within what the
 * server keeps.
 *
 * It sits on the page, inside the dark PDF filter with the ink, so it darkens
 * along with the page. It's a touch owner, so a finger on it types, and never
 * scrolls the page or draws on it.
 */
export function TextBox({ at, size, color, italic, text, width, uiScale, onChange, onDone, onCancel }: TextBoxProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // The box takes the keyboard as it opens, with the caret after any text it opens with.
  useEffect(() => {
    const box = ref.current;
    if (!box) return;
    box.focus({ preventScroll: true });
    box.setSelectionRange(box.value.length, box.value.length);
  }, []);

  const lineHeight = size * TEXT_LINE_HEIGHT;
  const lines = wrapText(text, size, italic, wrapWidth(at[0], width));
  const widest = text ? Math.max(...lines.map((line) => textWidth(line, size, italic))) : textWidth(PLACEHOLDER, size);
  const top = at[1] - lineHeight / 2;
  const below = top * uiScale < ROW_ROOM;

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
      return;
    }
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    onDone();
  };

  const insert = (symbol: string) => {
    const box = ref.current;
    if (!box) return;
    const { selectionStart: start, selectionEnd: end } = box;
    const next = text.slice(0, start) + symbol + text.slice(end);
    // A symbol never takes the text past the box's limit, just as typing can't.
    if (next.length > TEXT_MAX_LENGTH) return;
    onChange(next);
    const caret = start + symbol.length;
    requestAnimationFrame(() => {
      box.focus({ preventScroll: true });
      box.setSelectionRange(caret, caret);
    });
  };

  return (
    <div className="absolute inset-0 pointer-events-none">
      <div data-text-box="" data-touch-owner="" className="absolute pointer-events-auto" style={{ left: at[0], top }}>
        <div
          role="toolbar"
          aria-label="Symbols"
          className="absolute left-0 flex gap-1 rounded-xl bg-white p-1 shadow-md ring-1 ring-black/10"
          style={{
            [below ? "top" : "bottom"]: `calc(100% + ${8 / uiScale}px)`,
            transform: `scale(${1 / uiScale})`,
            transformOrigin: below ? "top left" : "bottom left",
          }}
        >
          {SYMBOLS.map(([symbol, name]) => (
            <button
              key={symbol}
              type="button"
              aria-label={name}
              title={name}
              // The text box keeps the keyboard, so the symbol goes in where the caret is.
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => insert(symbol)}
              className="grid h-11 min-w-11 place-items-center rounded-lg px-2 text-lg text-[#6b4c30] hover:bg-[#f5ebe0]"
              style={{ fontFamily: TEXT_FONT }}
            >
              {symbol}
            </button>
          ))}
        </div>
        <textarea
          ref={ref}
          aria-label="Text"
          value={text}
          maxLength={TEXT_MAX_LENGTH}
          placeholder={PLACEHOLDER}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          spellCheck={false}
          className="block resize-none overflow-hidden rounded-sm bg-white/85 p-0 outline-none ring-2 ring-[#a0704b] placeholder:text-[#a0704b]/60"
          style={{
            width: widest + size * 0.5,
            height: lines.length * lineHeight,
            fontFamily: TEXT_FONT,
            fontSize: size,
            lineHeight: TEXT_LINE_HEIGHT,
            fontStyle: italic ? "italic" : "normal",
            color,
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
          }}
        />
      </div>
    </div>
  );
}
