"use client";

/**
 * The board on the sign-in page: one worked problem a day, on a stretch of
 * Draft paper, written in the Draft's own ink (see lib/login-board/layout).
 *
 * It writes itself out once when the page opens, in about three seconds. The
 * axes come first, then the working a line at a time with its reasons, then
 * the line under the answer, then each curve traced along its length, then
 * the graph's equations and key points. After that it stays still, because a
 * sign-in page that keeps moving gets in the way of signing in. Anyone whose
 * device asks for less motion sees the finished board straight away.
 *
 * The entrances are CSS animations whose resting state is the finished
 * board, so the board is complete even where animations never run. Text is
 * uncovered from left to right by a clip, and a curve by a mask that runs
 * along its points, because pen ink is a filled outline rather than a line
 * that could be dashed.
 *
 * The board is laid out in the browser, because the working's line-up needs
 * the text measured in the board's fonts, which only a canvas can do. Until
 * then the paper shows on its own.
 *
 * In dark mode the paper and its ink are darkened together with the same
 * filter the lesson board uses in its dark PDF mode, so the board looks the
 * way a tutor's Draft does at night.
 */
import { useEffect, useId, useMemo, useState } from "react";
import { StrokePath } from "@/components/lesson/AnnotationLayer";
import { PDF_DARK_FILTER } from "@/hooks/usePdfDarkMode";
import { DRAFT_GRID_COLOUR, DRAFT_SQUARE } from "@/lib/draft-sheets";
import { boardLayout, type BoardLayout, type BoardPiece } from "@/lib/login-board/layout";
import { BOARD_PROBLEMS, type BoardProblem } from "@/lib/login-board/problems";
import { problemForDay } from "@/lib/login-board/today";
import { TEXT_FONT, textLayout } from "@/lib/text-ink";
import { cn } from "@/lib/utils";

/** How long each kind of piece takes to come on, and how long after the step before it starts, in seconds. */
const TIMING: Record<BoardPiece["part"], { duration: number; gap: number }> = {
  axes: { duration: 0.35, gap: 0 },
  line: { duration: 0.32, gap: 0.3 },
  reason: { duration: 0.28, gap: 0.3 },
  underline: { duration: 0.25, gap: 0.3 },
  curve: { duration: 0.7, gap: 0.2 },
  label: { duration: 0.25, gap: 0.7 },
  point: { duration: 0.3, gap: 0.25 },
};
/** The least paper the board shows, in squares across and, unless it's fitted, down. */
const MIN_WIDTH = 21 * DRAFT_SQUARE;
const MIN_HEIGHT = 11 * DRAFT_SQUARE;

/** The reasons start a little after their line, so the tutor seems to write the line first. */
const REASON_LAG = 0.12;

/** When each step starts, in seconds, given what's in it. */
function stepStarts(layout: BoardLayout): Map<number, number> {
  const steps = [...new Set(layout.pieces.map((piece) => piece.step))].sort((a, b) => a - b);
  const starts = new Map<number, number>();
  let at = 0;
  let previousGap = 0;
  for (const step of steps) {
    at += previousGap;
    starts.set(step, at);
    const parts = layout.pieces.filter((piece) => piece.step === step).map((piece) => piece.part);
    // A step waits for the slowest kind of piece in the step before it to be well under way.
    previousGap = Math.max(...parts.map((part) => TIMING[part].gap));
  }
  return starts;
}

const css = `
@keyframes login-board-write { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@keyframes login-board-trace { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
@keyframes login-board-appear { from { opacity: 0; } to { opacity: 1; } }
.login-board-write { transform-box: fill-box; transform-origin: left center; animation: login-board-write var(--d) linear var(--t) both; }
.login-board-trace { animation: login-board-trace var(--d) ease-in-out var(--t) both; }
.login-board-appear { animation: login-board-appear var(--d) ease-out var(--t) both; }
@media (prefers-reduced-motion: reduce) {
  .login-board-write, .login-board-trace, .login-board-appear { animation: none; }
}
`;

/**
 * The box round a text stroke, which its two points are the corners of. Text
 * drawn to end at a point can come out wider than it was measured, on a
 * device without the board's fonts, so its box reaches further left to be sure
 * the whole of it is uncovered.
 */
function textBox(piece: BoardPiece) {
  const [[left, top], [right, bottom]] = piece.stroke.points;
  const spare = piece.endsAt === undefined ? 2 : (right - left) * 0.5;
  return { x: left - spare, y: top - 2, width: right - left + spare + 2, height: bottom - top + 4 };
}

/**
 * A left-hand side of the working, drawn as the Draft draws text but ending at
 * its piece's endsAt, so the equals signs after it line up whatever the fonts.
 */
function EndingText({ piece }: { piece: BoardPiece }) {
  const { size, lines } = textLayout(piece.stroke);
  return (
    <text fill={piece.stroke.color} fontSize={size} fontFamily={TEXT_FONT} textAnchor="end" style={{ whiteSpace: "pre" }}>
      {lines.map((line, i) => (
        <tspan key={i} x={piece.endsAt} y={line.baseline}>{line.text}</tspan>
      ))}
    </text>
  );
}

/** A curve's own points as a path, for the mask that uncovers it along its length. */
function centreLine(piece: BoardPiece): string {
  return piece.stroke.points.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
}

function Piece({ piece, start, id, animate }: { piece: BoardPiece; start: number; id: string; animate: boolean }) {
  const { duration } = TIMING[piece.part];
  const t = start + (piece.part === "reason" ? REASON_LAG : 0);
  const timing = { "--t": `${t}s`, "--d": `${duration}s` } as React.CSSProperties;
  const ink = piece.endsAt === undefined ? <StrokePath stroke={piece.stroke} /> : <EndingText piece={piece} />;
  if (!animate) return ink;

  if (piece.entrance === "write") {
    const box = textBox(piece);
    return (
      <g clipPath={`url(#${id})`}>
        <defs>
          <clipPath id={id}>
            <rect {...box} className="login-board-write" style={timing} />
          </clipPath>
        </defs>
        {ink}
      </g>
    );
  }
  if (piece.entrance === "trace") {
    return (
      <g mask={`url(#${id})`}>
        <defs>
          <mask id={id} maskUnits="userSpaceOnUse" x={-10000} y={-10000} width={20000} height={20000}>
            <path
              d={centreLine(piece)}
              fill="none"
              stroke="white"
              strokeWidth={piece.stroke.size * 4}
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              strokeDasharray="1 1"
              className="login-board-trace"
              style={timing}
            />
          </mask>
        </defs>
        {ink}
      </g>
    );
  }
  return <g className="login-board-appear" style={timing}>{ink}</g>;
}

interface LoginBoardProps {
  /** The problem to show, by its id, for previews. Without it, the board shows today's problem. */
  problemId?: string;
  /** Leave out the writing-out, as the contact sheet of every problem does. */
  still?: boolean;
  /** Show the topic in a strip under the board. */
  caption?: boolean;
  /**
   * Size the board to its paper, as wide as it's given and as tall as the
   * paper needs at that width, rather than filling a box of the page's choosing.
   */
  fit?: boolean;
  /**
   * Classes for the paper itself, such as a cap on its height. A board that's
   * fitted to a wide column grows tall with it, and on a tall narrow screen
   * that pushes the sign-in button off the bottom, so the page caps it there.
   * The writing then shrinks to fit the cap, keeping its shape.
   */
  paperClassName?: string;
  className?: string;
}

export function LoginBoard({ problemId, still = false, caption = true, fit = false, paperClassName, className }: LoginBoardProps) {
  const uid = useId().replace(/:/g, "");
  const [problem, setProblem] = useState<BoardProblem | null>(null);
  const [layout, setLayout] = useState<BoardLayout | null>(null);

  // The problem is picked, and the board laid out, once the page is in the
  // browser: today's date has to be Hong Kong's on the viewer's own clock,
  // and the working's line-up needs its text measured in the board's fonts.
  useEffect(() => {
    const chosen = (problemId && BOARD_PROBLEMS.find((p) => p.id === problemId)) || problemForDay();
    setProblem(chosen);
    setLayout(boardLayout(chosen));
  }, [problemId]);

  const starts = useMemo(() => (layout ? stepStarts(layout) : new Map<number, number>()), [layout]);
  const box = layout?.box;
  // The board always shows at least this much paper across, so a short
  // problem is written at the same size as a long one, starting from the top
  // left the way a tutor starts, instead of being blown up to fill the space.
  // A board in a box of the page's choosing shows at least this much down too.
  // A fitted board's paper is only as tall as its working, which has about a
  // square of margin under it already, so there's no empty grid underneath.
  const shown = {
    width: Math.max(box?.width ?? 0, MIN_WIDTH),
    height: fit && box ? box.height : Math.max(box?.height ?? 0, MIN_HEIGHT),
  };
  // A wide stretch of squared paper round the board, so the paper fills whatever space the board is given.
  const reach = 50 * DRAFT_SQUARE;

  return (
    <figure
      className={cn("m-0 flex flex-col overflow-hidden rounded-md border border-line bg-paper", className)}
      aria-label={problem ? `A worked example on the board: ${problem.topic}` : "A worked example on the board"}
    >
      <style>{css}</style>
      <div
        className={cn("relative bg-white dark:[filter:var(--login-board-dark)]", !fit && "min-h-0 flex-1", paperClassName)}
        style={{
          ["--login-board-dark" as string]: PDF_DARK_FILTER,
          ...(fit && { aspectRatio: `${shown.width} / ${shown.height}` }),
        }}
      >
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox={`${box?.left ?? 0} ${box?.top ?? 0} ${shown.width} ${shown.height}`}
          preserveAspectRatio="xMinYMin meet"
          aria-hidden="true"
        >
          <defs>
            <pattern id={`${uid}-squares`} width={DRAFT_SQUARE} height={DRAFT_SQUARE} patternUnits="userSpaceOnUse">
              <path
                d={`M ${DRAFT_SQUARE} 0 L 0 0 0 ${DRAFT_SQUARE}`}
                fill="none"
                stroke={DRAFT_GRID_COLOUR.css}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            </pattern>
          </defs>
          <rect x={-reach} y={-reach} width={reach * 3} height={reach * 3} fill="#ffffff" />
          <rect x={-reach} y={-reach} width={reach * 3} height={reach * 3} fill={`url(#${uid}-squares)`} />
          {layout?.pieces.map((piece, i) => (
            <Piece key={i} piece={piece} start={starts.get(piece.step) ?? 0} id={`${uid}-${i}`} animate={!still} />
          ))}
        </svg>
      </div>
      {caption && (
        <figcaption className="flex min-h-8 items-center gap-2 border-t border-line px-3 py-1.5 text-xs text-ink-subtle">
          {/* Only the topic shows. Which form meets a topic first differs between schools, so a form tag here would often be wrong. */}
          {problem && <span className="truncate">{problem.topic}</span>}
        </figcaption>
      )}
    </figure>
  );
}
