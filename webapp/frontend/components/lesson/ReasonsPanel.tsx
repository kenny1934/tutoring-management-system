"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { TEXT_FONT, type TextPart } from "@/lib/text-ink";
import { TEXT_SWATCHES, textColourName, type InkSize } from "@/hooks/useAnnotationTools";
import {
  SLOT, fillSlots, readRecentLines, reasonPart, rememberRecentLine, searchReasons, slotsIn,
  type ProofReason, type ReasonLine,
} from "@/lib/proof-reasons";

// What a screen reader calls the boxes for a line's letters, which are the letters of its two parallel lines.
const LETTER_LABELS = ["First line", "Second line"];

const SIZES: InkSize[] = ["S", "M", "L"];
const SIZE_NAMES: Record<InkSize, string> = { S: "Small text", M: "Medium text", L: "Large text" };
// The A on each size button grows with the size it picks.
const SIZE_SAMPLE: Record<InkSize, number> = { S: 12, M: 16, L: 21 };

// Every line is a button that looks like one before it's touched, because a
// finger on the board can't hover. A mouse hover fills it a little, and a
// press fills it more, with a ring round it.
const CHIP = cn(
  "min-h-10 max-w-full select-none rounded-lg px-3 py-1.5 text-left text-[15px] leading-snug outline-none transition-colors",
  "bg-white ring-1 ring-[#e3cfb1] shadow-[0_1px_1px_rgba(46,30,14,0.06)]",
  "hover:bg-[#f7ecdd] hover:ring-[#cfae84] active:bg-[#efdcc3] active:ring-2 active:ring-[#a0704b]",
  "focus-visible:ring-2 focus-visible:ring-[#a0704b]",
  "dark:bg-[#231d14] dark:ring-[#4a3c2e] dark:hover:bg-[#3a3228] dark:hover:ring-[#7a6650] dark:active:bg-[#4a3c2e]",
);
// The line whose letters are being asked for keeps looking pressed.
const CHIP_PICKED = "bg-[#f7ecdd] ring-2 ring-[#a0704b] dark:bg-[#3a3228]";

// The size and colour buttons in the header, and the topic tabs under the search.
const OPTION = cn(
  "grid h-10 min-w-10 place-items-center rounded-lg px-1.5 outline-none transition-colors",
  "hover:bg-[#f5ebe0] focus-visible:ring-2 focus-visible:ring-[#a0704b] dark:hover:bg-[#3a3228]",
);
const OPTION_ON = "bg-white ring-2 ring-[#a0704b] hover:bg-white dark:bg-[#231d14] dark:hover:bg-[#231d14]";
const TAB = cn(
  "h-10 flex-none rounded-full px-3.5 text-sm font-medium outline-none transition-colors",
  "bg-white ring-1 ring-[#e3cfb1] hover:bg-[#f7ecdd] active:bg-[#efdcc3] focus-visible:ring-2 focus-visible:ring-[#a0704b]",
  "dark:bg-[#231d14] dark:ring-[#4a3c2e] dark:hover:bg-[#3a3228]",
);
const TAB_ON = "bg-[#a0704b] text-white ring-[#a0704b] hover:bg-[#a0704b] dark:bg-[#a0704b] dark:hover:bg-[#a0704b]";

/** Where a tapped line was tapped: in a reason's row, or among the recent lines. */
type From = ProofReason | "recent";

/** A line that's been tapped and is asking for its letters. */
interface Asking {
  from: From;
  line: ReasonLine;
  letters: string[];
}

const sameLine = (a: ReasonLine, b: ReasonLine) => a.side === b.side && a.line === b.line;

interface ReasonsPanelProps {
  onPick: (parts: TextPart[]) => void;
  /** The size and colour new text is written in, which the Text tool shares. */
  textSize: InkSize;
  textColour: string;
  onTextSize: (size: InkSize) => void;
  onTextColour: (id: string) => void;
  /** The search. The tray keeps it while the list is closed, so the list opens as it was left. */
  query: string;
  onQueryChange: (query: string) => void;
  /** How far down the list is scrolled, which the tray keeps for the same reason. */
  scrollRef: { current: number };
  /** The letters typed last in this lesson for each line that has them, by the line as the sheet writes it. */
  letters: Record<string, string[]>;
  onLetters: (line: string, letters: string[]) => void;
}

/**
 * The Pen Tray's list of proof reasons (see lib/proof-reasons). The reasons
 * are grouped by topic, and each one shows its English and its Chinese side
 * by side, as the centre's sheet does. Every line is a button, and a tap
 * places that line on its own: the tray then waits for a tap on the page to
 * say where it goes. A tutor who wants both languages places one, opens the
 * list again, which is as they left it, and places the other.
 *
 * The header sets the size and colour of the text, and a tab for each topic
 * jumps to it, so a reason can be found without typing. The lines picked last
 * on the laptop sit at the top. A line with letters that change, such as
 * "alt. ∠s, AB // CD", asks for them first, starting with the letters typed
 * for it last in the lesson.
 */
export function ReasonsPanel({
  onPick, textSize, textColour, onTextSize, onTextColour, query, onQueryChange, scrollRef, letters, onLetters,
}: ReasonsPanelProps) {
  const [asking, setAsking] = useState<Asking | null>(null);
  const [recent] = useState(readRecentLines);
  // The topic at the top of the list, whose tab is lit.
  const [current, setCurrent] = useState<string | null>(null);
  const topics = useMemo(() => searchReasons(query), [query]);
  const listRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLElement>(null);
  const sections = useRef(new Map<string, HTMLElement>());
  const showRecent = query.trim() === "" && recent.length > 0;

  // The last topic whose section has reached the top of the list.
  const topicInView = (list: HTMLElement) => {
    let found: string | null = null;
    for (const topic of topics) {
      const section = sections.current.get(topic.title);
      if (section && section.offsetTop <= list.scrollTop + 1) found = topic.title;
    }
    return found;
  };

  // The list opens scrolled to where it was left.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    list.scrollTop = scrollRef.current;
    setCurrent(topicInView(list));
    // Only as it opens. After that, scrolling keeps the lit tab up to date.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollRef]);

  // The lit tab stays in sight in the row of tabs.
  useEffect(() => {
    const row = tabsRef.current;
    const tab = row?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!row || !tab) return;
    if (tab.offsetLeft < row.scrollLeft) row.scrollLeft = tab.offsetLeft - 12;
    else if (tab.offsetLeft + tab.offsetWidth > row.scrollLeft + row.clientWidth) {
      row.scrollLeft = tab.offsetLeft + tab.offsetWidth - row.clientWidth + 12;
    }
  }, [current]);

  const scrollListTo = (top: number) => {
    scrollRef.current = top;
    if (listRef.current) listRef.current.scrollTop = top;
  };

  const search = (next: string) => {
    onQueryChange(next);
    setAsking(null);
    setCurrent(null);
    // A new search starts at its first match.
    scrollListTo(0);
  };

  const jumpTo = (title: string) => {
    const section = sections.current.get(title);
    if (!section) return;
    scrollListTo(section.offsetTop);
    setCurrent(title);
  };

  const place = (line: ReasonLine, typed: string[] = []) => {
    rememberRecentLine(line);
    if (typed.length > 0) {
      // A box left empty keeps the letters the line starts with.
      const starts = slotsIn(line.line);
      onLetters(line.line, typed.map((l, i) => l.trim() || starts[i]));
    }
    onPick([reasonPart(line, typed)]);
  };

  const pickLine = (from: From, line: ReasonLine) => {
    const starts = slotsIn(line.line);
    if (starts.length === 0) place(line);
    else setAsking({ from, line, letters: letters[line.line] ?? starts });
  };

  const chip = (from: From, line: ReasonLine, key: string | number) => (
    <LineChip
      key={key}
      line={line}
      letters={letters[line.line]}
      picked={asking?.from === from && sameLine(asking.line, line)}
      onPick={() => pickLine(from, line)}
    />
  );

  const letterBoxes = (from: From) =>
    asking?.from === from && (
      <LetterBoxes
        asking={asking}
        onLetters={(typed) => setAsking((a) => a && { ...a, letters: typed })}
        onPlace={() => place(asking.line, asking.letters)}
      />
    );

  return (
    <div
      role="dialog"
      aria-label="Proof reasons"
      className={cn(
        "flex w-[min(46rem,calc(100vw-1rem))] max-h-[min(38rem,calc(100dvh-8rem))] flex-col overflow-hidden rounded-[14px]",
        "bg-[#fef9f3] text-[#3d2f22] ring-1 ring-[#e8d4b8] shadow-[0_12px_32px_rgba(46,30,14,0.35)]",
        "dark:bg-[#2d2618] dark:text-[#eadfcd] dark:ring-[#6b5a4a]",
      )}
    >
      <div className="flex flex-col gap-2 border-b border-[#e8d4b8] p-3 dark:border-[#4a3c2e]">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h2 className="mr-auto text-sm font-semibold">Proof reasons</h2>
          <div role="group" aria-label="Text size" className="flex items-center gap-1">
            <span aria-hidden className="mr-1 text-xs text-[#8b7355] dark:text-[#b8a58a]">Size</span>
            {SIZES.map((size) => (
              <button
                key={size}
                type="button"
                aria-label={SIZE_NAMES[size]}
                title={SIZE_NAMES[size]}
                aria-pressed={textSize === size}
                onClick={() => onTextSize(size)}
                className={cn(OPTION, textSize === size && OPTION_ON)}
              >
                <span className="leading-none" style={{ fontSize: SIZE_SAMPLE[size], fontFamily: TEXT_FONT }}>A</span>
              </button>
            ))}
          </div>
          <div role="group" aria-label="Text colour" className="flex items-center gap-1">
            <span aria-hidden className="mr-1 text-xs text-[#8b7355] dark:text-[#b8a58a]">Colour</span>
            {TEXT_SWATCHES.map((swatch) => (
              <button
                key={swatch.id}
                type="button"
                aria-label={textColourName(swatch)}
                title={textColourName(swatch)}
                aria-pressed={textColour === swatch.id}
                onClick={() => onTextColour(swatch.id)}
                className={cn(OPTION, textColour === swatch.id && OPTION_ON)}
              >
                <span className="block h-5 w-5 rounded-full" style={{ backgroundColor: swatch.color }} />
              </button>
            ))}
          </div>
        </div>
        <label className="relative flex items-center">
          <Search aria-hidden className="pointer-events-none absolute left-3 h-4 w-4 text-[#8b7355]" />
          <input
            type="search"
            value={query}
            onChange={(e) => search(e.target.value)}
            aria-label="Find a reason"
            placeholder="Find a reason or topic, such as alt or 全等"
            className={cn(
              "h-10 w-full rounded-lg bg-white pl-9 pr-3 text-sm outline-none ring-1 ring-[#d4c4a8] focus:ring-2 focus:ring-[#a0704b]",
              "dark:bg-[#1e1a14] dark:ring-[#6b5a4a]",
            )}
          />
        </label>
        {topics.length > 0 && (
          <nav
            ref={tabsRef}
            aria-label="Topics"
            className="relative -mx-3 flex gap-1.5 overflow-x-auto overscroll-contain px-3 py-0.5 [scrollbar-width:thin]"
          >
            {topics.map((topic) => (
              <button
                key={topic.title}
                type="button"
                title={topic.title}
                aria-current={current === topic.title ? "true" : undefined}
                onClick={() => jumpTo(topic.title)}
                className={cn(TAB, current === topic.title && TAB_ON)}
              >
                {topic.tab}
              </button>
            ))}
          </nav>
        )}
      </div>

      <div
        ref={listRef}
        onScroll={(e) => {
          scrollRef.current = e.currentTarget.scrollTop;
          setCurrent(topicInView(e.currentTarget));
        }}
        className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y px-3 pb-3"
      >
        {showRecent && (
          <section aria-label="Recent">
            <h3 className={HEADING}>Recent</h3>
            <div className="flex flex-wrap gap-1.5 border-t border-[#efe3d0] py-2 dark:border-[#3a3228]">
              {recent.map((line) => chip("recent", line, `${line.side}:${line.line}`))}
            </div>
            {letterBoxes("recent")}
          </section>
        )}
        {topics.map((topic) => (
          <section
            key={topic.title}
            aria-label={topic.title}
            ref={(el) => {
              if (el) sections.current.set(topic.title, el);
              else sections.current.delete(topic.title);
            }}
          >
            <h3 className={HEADING}>{topic.title}</h3>
            {topic.reasons.map((reason) => (
              <div
                key={[...reason.en, ...reason.zh].join("|")}
                className="grid grid-cols-2 gap-x-3 border-t border-[#efe3d0] py-2 dark:border-[#3a3228]"
              >
                <div className="flex min-w-0 flex-col items-start gap-1.5">
                  {reason.en.map((line, i) => chip(reason, { side: "en", line }, i))}
                  {reason.notInTextbooks && (
                    <span className="inline-block rounded border border-current px-1.5 text-[11px] font-medium text-[#9a6b12] dark:text-[#e5b95c]">
                      Not in MiA or MathSmart
                    </span>
                  )}
                </div>
                <div className="flex min-w-0 flex-col items-start gap-1.5">
                  {reason.zh.map((line, i) => chip(reason, { side: "zh", line }, i))}
                  {reason.note && (
                    <p lang="zh-Hant" className="px-1 text-xs text-[#8b7355] dark:text-[#b8a58a]">解釋：{reason.note}</p>
                  )}
                </div>
                {letterBoxes(reason)}
              </div>
            ))}
          </section>
        ))}
        {topics.length === 0 && <p className="py-6 text-sm text-[#8b7355]">No reasons match “{query}”.</p>}
      </div>
    </div>
  );
}

const HEADING =
  "sticky top-0 z-10 bg-[#fef9f3] pb-1.5 pt-3 text-xs font-semibold uppercase tracking-wide text-[#8b7355] dark:bg-[#2d2618] dark:text-[#b8a58a]";

/** One line of a reason as a button, with the letters typed for it last in the lesson. English is in italic, as it will be on the page. */
function LineChip({ line, letters, picked, onPick }: { line: ReasonLine; letters?: string[]; picked: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      lang={line.side === "zh" ? "zh-Hant" : "en"}
      onClick={onPick}
      className={cn(CHIP, picked && CHIP_PICKED)}
      style={{ fontFamily: TEXT_FONT, fontStyle: line.side === "en" ? "italic" : "normal" }}
    >
      {fillSlots(line.line, letters)}
    </button>
  );
}

/**
 * The tapped line written out with a box in place of each set of letters, and
 * the Place button. The boxes start with the letters typed for the line last
 * in the lesson, or the line's own, so Place straight away uses those.
 */
function LetterBoxes({ asking, onLetters, onPlace }: { asking: Asking; onLetters: (letters: string[]) => void; onPlace: () => void }) {
  const { side, line } = asking.line;
  return (
    <form
      className="col-span-2 mt-2 flex flex-wrap items-center gap-x-1 gap-y-2 rounded-lg bg-[#f5ebe0] px-3 py-2 dark:bg-[#3a3228]"
      onSubmit={(e) => {
        e.preventDefault();
        onPlace();
      }}
    >
      <span className={cn("flex flex-wrap items-center gap-1 text-[15px]", side === "en" && "italic")} style={{ fontFamily: TEXT_FONT }}>
        {line.split(SLOT).map((piece, i) => {
          // Splitting on the slots leaves the words at the even places and each slot's letters at the odd ones.
          if (i % 2 === 0) return piece && <span key={i} className="whitespace-pre">{piece}</span>;
          const at = (i - 1) / 2;
          return (
            <input
              key={i}
              value={asking.letters[at]}
              autoFocus={at === 0}
              aria-label={LETTER_LABELS[at] ?? `Letters ${at + 1}`}
              onFocus={(e) => e.target.select()}
              onChange={(e) => onLetters(asking.letters.map((letters, j) => (j === at ? e.target.value : letters)))}
              maxLength={6}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              className="h-10 w-16 rounded-md bg-white text-center not-italic outline-none ring-1 ring-[#d4c4a8] focus:ring-2 focus:ring-[#a0704b] dark:bg-[#1e1a14]"
            />
          );
        })}
      </span>
      <button type="submit" className="ml-auto h-10 rounded-lg bg-[#a0704b] px-4 text-sm font-medium text-white hover:bg-[#8b5e3c]">
        Place
      </button>
    </form>
  );
}
