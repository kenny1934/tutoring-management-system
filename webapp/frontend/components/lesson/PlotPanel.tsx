"use client";

import { createElement, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { KEYBOARD_THEME_CSS } from "@/lib/mathlive-theme";
import { patchMathLiveMenu } from "@/lib/mathlive-utils";
import { axisNumber, type AxesSettings, type AxisName, type AxisSettings } from "@/lib/axes";
import { draftKeyPoints } from "@/lib/plot";
import type { AngleUnit, Reading } from "@/lib/plot-expression";
import { FIELD, MAIN_BUTTON, PANEL_CARD, TEXT_BUTTON } from "./AxesPanel";

/** The Tools menu's picture for Plot a graph: a pair of axes with a curve across them. */
export function GraphIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M3 15h18" />
      <path d="M9 21V3" />
      <path d="M4 4q8 22 16 0" />
    </svg>
  );
}

/** The parts of MathLive's maths field the panel uses. */
interface MathField extends HTMLElement {
  value: string;
  mathVirtualKeyboardPolicy: string;
}

const MINUS = "−";

/** One axis as the panel names it, such as "x from −10 to 10 at 2 a square". The scale is left out at 1 a square. */
function axisWords(axis: AxisName, settings: AxisSettings): string {
  const number = (squares: number) => axisNumber(squares, settings.perSquare, settings.degrees).replace("-", MINUS);
  const scale = settings.perSquare === 1 ? "" : ` at ${axisNumber(1, settings.perSquare, settings.degrees)} a square`;
  return `${axis} from ${number(settings.from)} to ${number(settings.to)}${scale}`;
}

const SWITCH = "min-h-11 flex-1 rounded-md px-3 font-medium";

interface PlotPanelProps {
  /** The function as the field has it, in LaTeX. */
  latex: string;
  onLatexChange: (latex: string) => void;
  /** What the function reads as, which says whether it can be plotted. */
  reading: Reading;
  unit: AngleUnit;
  onUnitChange: (unit: AngleUnit) => void;
  /** The axes the graph goes on, which are the ones this board drew last. */
  axes: AxesSettings;
  /** Plot pressed, which moves on to the tap that says where the axes cross. */
  onPlot: () => void;
  onClose: () => void;
}

/**
 * The Draft's Graph panel, where a tutor types the function to plot before a
 * tap on a sheet says where the axes cross. "y =" sits in front of a MathLive
 * maths field, which turns sin, pi and sqrt into maths and a slash into a
 * fraction as they're typed on the laptop's keyboard. Below it are the switch
 * between degrees and radians, the tick box for marking the key points, which
 * each board remembers, and a line naming the axes the graph will go on.
 *
 * Plot stays greyed out until the function can be plotted, and a line under
 * the field says why. Enter in the field plots too, once Plot would. The
 * field starts with the function typed last, so a second graph on the same
 * axes needs only a change.
 *
 * It's a card at the top right of the Draft, where the axes panel opens.
 * Unlike that panel, a tap elsewhere doesn't close it, because MathLive opens
 * its own menu and keyboard outside the card. Cancel and Escape close it,
 * which the Draft looks after, and MathLive's menus close first on Escape
 * because they keep the key to themselves.
 */
export function PlotPanel({ latex, onLatexChange, reading, unit, onUnitChange, axes, onPlot, onClose }: PlotPanelProps) {
  const [markKeyPoints, setMarkKeyPoints] = draftKeyPoints.usePreference();
  const fieldRef = useRef<MathField | null>(null);
  const [loaded, setLoaded] = useState(false);
  const ready = reading.status === "ready";
  // The field's listeners read the latest of these, so they're added only once.
  const latest = useRef({ onLatexChange, onPlot, ready });
  useEffect(() => {
    latest.current = { onLatexChange, onPlot, ready };
  });
  const [startingLatex] = useState(latex);

  // MathLive is loaded only once the panel opens, as the Wolfram panel loads it.
  useEffect(() => {
    let open = true;
    import("mathlive").then(() => {
      if (open) setLoaded(true);
    });
    return () => {
      open = false;
    };
  }, []);

  useEffect(() => {
    const field = fieldRef.current;
    if (!loaded || !field) return;
    // Its on-screen keyboard only comes up from its own button, since the boards have a laptop keyboard.
    field.mathVirtualKeyboardPolicy = "manual";
    field.value = startingLatex;
    const onInput = () => latest.current.onLatexChange(field.value ?? "");
    // Enter is caught on the way down to the field, before MathLive takes it.
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || !latest.current.ready) return;
      e.preventDefault();
      latest.current.onPlot();
    };
    field.addEventListener("input", onInput);
    field.addEventListener("keydown", onKeyDown, true);
    field.focus();
    const unpatchMenu = patchMathLiveMenu(fieldRef);
    return () => {
      field.removeEventListener("input", onInput);
      field.removeEventListener("keydown", onKeyDown, true);
      unpatchMenu();
      (window as { mathVirtualKeyboard?: { hide: () => void } }).mathVirtualKeyboard?.hide();
    };
  }, [loaded, startingLatex]);

  const message = reading.status === "empty"
    ? "Type a function of x, such as y = x² − 2x − 3."
    : reading.status === "unfinished"
      ? "This can't be plotted yet. Check for an empty box or a missing bracket."
      : "";
  const fieldClass = cn(FIELD, "min-h-11 min-w-0 flex-1 px-2 text-lg text-[#4a3728] dark:text-[#e3d5c5]");

  return (
    <div role="dialog" aria-label="Graph" data-touch-owner="" className={cn(PANEL_CARD, "w-[22rem]")}>
      {loaded && <style>{KEYBOARD_THEME_CSS}</style>}
      <h2 className="mb-2 text-base font-semibold">Graph</h2>
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="flex-none font-serif text-lg">
          <i>y</i> =
        </span>
        {loaded
          ? createElement("math-field", { ref: fieldRef, "aria-label": "Function of x", className: fieldClass, style: { display: "block" } })
          : <div aria-hidden="true" className={fieldClass} />}
      </div>
      <p aria-live="polite" className="mt-1 min-h-8 text-xs">{message}</p>
      <div role="group" aria-label="Angles" className="mt-1 flex gap-1 rounded-lg border border-[#e8d4b8] p-0.5 dark:border-[#6b5a4a]">
        {(["degrees", "radians"] as const).map((choice) => (
          <button
            key={choice}
            type="button"
            aria-pressed={unit === choice}
            onClick={() => onUnitChange(choice)}
            className={cn(SWITCH, unit === choice ? "bg-[#e8d4b8] dark:bg-[#4a3d30]" : "hover:bg-[#f5ebe0] dark:hover:bg-[#3a3228]")}
          >
            {choice === "degrees" ? "Degrees" : "Radians"}
          </button>
        ))}
      </div>
      <label className="mt-2 flex min-h-11 items-center gap-2">
        <input
          type="checkbox"
          checked={markKeyPoints}
          onChange={(e) => setMarkKeyPoints(e.target.checked)}
          className="h-5 w-5 accent-[#a0704b]"
        />
        Mark the key points
      </label>
      <p className="mt-2 text-xs opacity-80">
        Plots on the last axes drawn here: {axisWords("x", axes.x)} and {axisWords("y", axes.y)}.
      </p>
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" onClick={onClose} className={TEXT_BUTTON}>
          Cancel
        </button>
        <button type="button" disabled={!ready} onClick={onPlot} className={MAIN_BUTTON}>
          Plot
        </button>
      </div>
    </div>
  );
}
