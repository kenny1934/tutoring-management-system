"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  DEFAULT_AXES, NUMBERING, axisNumber, endLimits, nearestPerSquare, scaleSteps, stepPerSquare, withDegrees, withEnd,
  type AxesSettings, type AxisName, type AxisSettings, type Numbering,
} from "@/lib/axes";
import { Stepper } from "./Stepper";
import { useCloseOnOutsideTap } from "./ToolParts";

/** The Tools menu's picture for Draw axes: two axes crossing, each with an arrow at its positive end. */
export function AxesIcon({ className }: { className?: string }) {
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
      <path d="M18 12l3 3-3 3" />
      <path d="M9 21V3" />
      <path d="M6 6l3-3 3 3" />
    </svg>
  );
}

const NUMBERS_LABEL: Record<Numbering, string> = {
  1: "On every square",
  2: "On every 2 squares",
  5: "On every 5 squares",
  0: "None",
};

// The panel isn't scaled with the sheet, so its controls are the menu rows' finger size.
const ROW = "flex h-11 items-center";
const HEAD = "flex h-7 items-center";
const STEP_BUTTON = cn(
  "grid h-11 w-11 flex-none place-items-center rounded-full hover:bg-[#f5ebe0] dark:hover:bg-[#3a3228]",
  "disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed",
);

// The Draft's panels, this one and the Graph panel, share one look.
/** A panel's card, at the top right of the Draft. */
export const PANEL_CARD = cn(
  "absolute right-2 top-2 z-30 max-h-[calc(100%-1rem)] max-w-[calc(100%-1rem)] overflow-auto rounded-lg border p-3 text-sm shadow-lg",
  "border-[#e8d4b8] dark:border-[#6b5a4a] bg-[#fef9f3] dark:bg-[#2d2618] text-[#6b4c30] dark:text-[#d4a574]",
);
export const FIELD = "rounded border border-[#e8d4b8] dark:border-[#6b5a4a] bg-white dark:bg-[#1e1a14] outline-none focus:border-[#a0704b]";
export const TEXT_BUTTON = "min-h-11 rounded-md px-3 hover:bg-[#f5ebe0] dark:hover:bg-[#3a3228]";
/** The button that goes on to placing, such as Place the axes. */
export const MAIN_BUTTON = cn(
  "min-h-11 rounded-md bg-[#a0704b] px-4 font-medium text-white hover:bg-[#8a5f3f]",
  "disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#a0704b]",
);

interface NumberFieldProps {
  label: string;
  /** The value as the box shows it while nothing is being typed. */
  value: string;
  /** Handed what was typed once Enter is pressed or the box loses focus. */
  onTyped: (text: string) => void;
  onLess: () => void;
  onMore: () => void;
  lessDisabled: boolean;
  moreDisabled: boolean;
  lessLabel: string;
  moreLabel: string;
}

/**
 * One of the panel's settings, with its − and + buttons and a box to type it
 * into. The box shows what's being typed until Enter is pressed or it loses
 * focus. Then the setting takes it, and the box shows the setting again.
 */
function NumberField({ label, value, onTyped, ...buttons }: NumberFieldProps) {
  const [typed, setTyped] = useState<string | null>(null);
  const settle = () => {
    if (typed !== null) onTyped(typed);
    setTyped(null);
  };
  return (
    <div role="group" aria-label={label} className={ROW}>
      <Stepper
        text={typed ?? value}
        onTextChange={setTyped}
        {...buttons}
        onBlur={settle}
        onEnter={settle}
        boxLabel={label}
        buttonClassName={STEP_BUTTON}
        inputClassName={cn(FIELD, "h-9 w-[6ch] min-w-0 text-center tabular-nums")}
      />
    </div>
  );
}

/** One axis's settings, which the panel shows as a column. */
function AxisSection({ axis, settings, onChange }: { axis: AxisName; settings: AxisSettings; onChange: (next: AxisSettings) => void }) {
  const limits = endLimits(axis, settings);
  const { degrees = false } = settings;
  const steps = scaleSteps(degrees);
  const end = (which: "from" | "to") => (
    <NumberField
      label={which === "from" ? "From" : "To"}
      value={axisNumber(settings[which], settings.perSquare, degrees)}
      // Typed in the axis's own numbers, and rounded to a whole number of squares.
      onTyped={(text) => {
        const value = Number.parseFloat(text);
        if (Number.isFinite(value)) onChange(withEnd(axis, settings, which, value / settings.perSquare));
      }}
      onLess={() => onChange(withEnd(axis, settings, which, settings[which] - 1))}
      onMore={() => onChange(withEnd(axis, settings, which, settings[which] + 1))}
      lessDisabled={settings[which] <= limits[which][0]}
      moreDisabled={settings[which] >= limits[which][1]}
      lessLabel="One square lower"
      moreLabel="One square higher"
    />
  );
  return (
    <section aria-label={`${axis} axis`} className="flex flex-col gap-1">
      <h3 className={cn(HEAD, "font-semibold")}>{axis} axis</h3>
      {end("from")}
      {end("to")}
      <NumberField
        label="Scale"
        value={axisNumber(1, settings.perSquare, degrees)}
        onTyped={(text) => {
          const perSquare = nearestPerSquare(Number.parseFloat(text), degrees);
          if (perSquare !== null) onChange({ ...settings, perSquare });
        }}
        onLess={() => onChange({ ...settings, perSquare: stepPerSquare(settings.perSquare, -1, degrees) })}
        onMore={() => onChange({ ...settings, perSquare: stepPerSquare(settings.perSquare, 1, degrees) })}
        lessDisabled={settings.perSquare <= steps[0]}
        moreDisabled={settings.perSquare >= steps[steps.length - 1]}
        lessLabel="Each square worth less"
        moreLabel="Each square worth more"
      />
      {/* Only the x axis can be in degrees, for the graph of sin, cos or tan. The y axis keeps the row empty, so the rows still line up. */}
      {axis === "x" ? (
        <label className={cn(ROW, "gap-2")}>
          <input
            type="checkbox"
            checked={degrees}
            onChange={(e) => onChange(withDegrees(settings, e.target.checked))}
            className="h-5 w-5 accent-[#a0704b]"
          />
          Degrees
        </label>
      ) : (
        <span aria-hidden="true" className={ROW} />
      )}
      <div className={ROW}>
        <select
          aria-label="Numbers"
          value={settings.numbers}
          onChange={(e) => onChange({ ...settings, numbers: Number(e.target.value) as Numbering })}
          className={cn(FIELD, "h-11 w-full px-1")}
        >
          {NUMBERING.map((every) => (
            <option key={every} value={every}>{NUMBERS_LABEL[every]}</option>
          ))}
        </select>
      </div>
      {/* How long the axis is, so a tutor can judge whether it fits where they're about to tap */}
      <p className={cn(HEAD, "text-xs opacity-80")}>{settings.to - settings.from} cm long</p>
    </section>
  );
}

interface AxesPanelProps {
  settings: AxesSettings;
  onChange: (settings: AxesSettings) => void;
  /** Place the axes pressed, which moves on to the tap that says where they cross. */
  onPlace: () => void;
  onClose: () => void;
}

/**
 * The Draft's axes panel: the settings for a pair of numbered axes, before a
 * tap on a sheet says where they cross. Each axis has its own column, and
 * each column has the same four settings: where the axis starts and ends,
 * what one square is worth, and how often a number is written.
 *
 * It's a card at the top right of the Draft. Like the compasses' width box, a
 * tap anywhere else closes it without placing anything, and the page doesn't
 * get that tap. Escape closes it too, which the Draft looks after.
 */
export function AxesPanel({ settings, onChange, onPlace, onClose }: AxesPanelProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  useCloseOnOutsideTap(boxRef, onClose);

  const setAxis = (axis: AxisName) => (next: AxisSettings) => onChange({ ...settings, [axis]: next });

  return (
    <div ref={boxRef} role="dialog" aria-label="Axes" data-touch-owner="" className={PANEL_CARD}>
      <div className="mb-1 flex items-center justify-between gap-4">
        <h2 className="text-base font-semibold">Axes</h2>
        <button type="button" onClick={() => onChange(DEFAULT_AXES)} className={TEXT_BUTTON}>
          Reset
        </button>
      </div>
      <div className="flex gap-3">
        {/* The names of the rows, once for both columns. Each setting carries its own name for a screen reader. */}
        <div aria-hidden="true" className="flex flex-col gap-1 text-xs font-medium">
          <span className={HEAD} />
          <span className={ROW}>From</span>
          <span className={ROW}>To</span>
          <span className={ROW}>Scale</span>
          <span className={ROW} />
          <span className={ROW}>Numbers</span>
          <span className={HEAD} />
        </div>
        <AxisSection axis="x" settings={settings.x} onChange={setAxis("x")} />
        <AxisSection axis="y" settings={settings.y} onChange={setAxis("y")} />
      </div>
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" onClick={onClose} className={TEXT_BUTTON}>
          Cancel
        </button>
        <button type="button" onClick={onPlace} className={MAIN_BUTTON}>
          Place the axes
        </button>
      </div>
    </div>
  );
}
