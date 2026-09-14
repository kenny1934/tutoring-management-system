"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { FlipHorizontal2, Minus, PencilOff, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { PDF_DARK_FILTER } from "@/hooks/usePdfDarkMode";
import { usePlacedTool } from "@/hooks/usePlacedTool";
import { inkPageAt, inkSnapAt, type DrivenLine } from "@/hooks/useInkPages";
import {
  addTurn, arcPoints, directionOf, hingeHeight, mirroredAt, opensTo, pointAt, readCompassWidth, saveCompassWidth,
  snapWidth, sweepRange, typedWidth,
} from "@/lib/compass";
import type { Vec } from "@/lib/stroke-select";
import { HANDLE_DOT, READING, ROUND_BUTTON, grabPointer } from "./ToolParts";

const LABEL =
  "Compasses: drag the needle to move them, drag the pencil to open or close them, and turn the handle at the top to draw";

const BUTTON_CLASS = cn("pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2", ROUND_BUTTON);

interface CompassProps {
  /** What the compasses lie in, such as the worksheet's stack of pages. They scroll and zoom along with it. */
  containerRef: RefObject<HTMLElement | null>;
  /** A centimetre in the container's own pixels, before any zoom. */
  cm: number;
  /** Where the middle of the compasses starts, in the container's own pixels. */
  start: Vec;
  /** Dark PDF mode, where the compasses darken along with the pages. */
  darkMode: boolean;
  onHide: () => void;
}

/** The point this far along the line from one point towards another. */
function along(from: Vec, to: Vec, distance: number): Vec {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1;
  return [from[0] + ((to[0] - from[0]) * distance) / length, from[1] + ((to[1] - from[1]) * distance) / length];
}

/** A turn of the handle at the top: how far it has gone, and the line it's drawing, if any. */
interface Turn {
  pointerId: number;
  /** The finger's last direction from the needle. */
  last: number;
  swept: number;
  /** The stretch of the turn the pencil has passed over, as the lowest and highest amounts turned. */
  range: [number, number];
  /** Which way the compasses pointed when the handle was grabbed. */
  from: number;
  started: boolean;
  /** Whether the pencil was down when the handle was grabbed, so the turn draws. */
  draws: boolean;
  line: DrivenLine | null;
}

// Things a tap elsewhere is left to when it closes the width's box, such as the Pen Tray's buttons.
const CONTROLS = "button, input, [role='toolbar'], [role='menu'], [role='dialog']";

interface WidthStepperProps {
  /** Where the width sits, in the container's own pixels. */
  at: Vec;
  width: number;
  /** A centimetre in the container's own pixels, which sizes the buttons for a finger. */
  cm: number;
  darkMode: boolean;
  onChange: (width: number) => void;
  onClose: () => void;
}

/**
 * The compasses' width, opened out so it can be set exactly. The − and +
 * buttons move it a millimetre at a time, which suits a finger at the board,
 * and the box takes a typed width. What's typed is kept between 0.5 and 13 cm
 * and snapped to a millimetre once Enter is pressed or the box loses focus,
 * and Escape closes the box and forgets it. A tap anywhere else closes it too,
 * and that tap is kept from the page, so closing it with a pen picked never
 * leaves a dot.
 */
function WidthStepper({ at, width, cm, darkMode, onChange, onClose }: WidthStepperProps) {
  const [typed, setTyped] = useState(width.toFixed(1));
  const boxRef = useRef<HTMLDivElement>(null);
  // Set once Escape has closed the box, so the box losing focus as it goes doesn't keep what was typed.
  const cancelledRef = useRef(false);
  // A width typed but not yet confirmed counts, so + straight after typing 6 goes to 6.1.
  const current = () => typedWidth(typed) ?? width;
  const settle = (next: number) => {
    onChange(next);
    setTyped(next.toFixed(1));
  };

  // The window's listener reads the latest width and typing through this, so it's only added once.
  const closeRef = useRef(() => {});
  useEffect(() => {
    closeRef.current = () => {
      settle(current());
      onClose();
    };
  });
  useEffect(() => {
    const outside = (e: PointerEvent) => {
      if (!(e.target instanceof Node) || boxRef.current?.contains(e.target)) return;
      if (!(e.target instanceof Element && e.target.closest(CONTROLS))) {
        e.stopPropagation();
        e.preventDefault();
      }
      closeRef.current();
    };
    window.addEventListener("pointerdown", outside, true);
    return () => window.removeEventListener("pointerdown", outside, true);
  }, []);

  const control = 0.8 * cm;
  const stepClass = "grid flex-none place-items-center rounded-full hover:bg-[#f3e7d3]/15";
  return (
    <div
      ref={boxRef}
      role="group"
      aria-label="Set the width"
      data-touch-owner=""
      className={cn(
        "absolute z-20 flex -translate-x-1/2 -translate-y-1/2 items-center rounded-full bg-[#2e251c]/90 shadow-lg",
        "font-mono text-[13px] font-semibold tabular-nums text-[#f3e7d3]",
      )}
      style={{ left: at[0], top: at[1], filter: darkMode ? PDF_DARK_FILTER : undefined }}
    >
      <button
        type="button"
        aria-label="A millimetre narrower"
        title="A millimetre narrower"
        onClick={() => settle(snapWidth(current() - 0.1))}
        className={stepClass}
        style={{ width: control, height: control }}
      >
        <Minus className="h-1/2 w-1/2" />
      </button>
      <input
        aria-label="Width in centimetres"
        inputMode="decimal"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        onBlur={() => {
          if (!cancelledRef.current) settle(current());
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            settle(current());
            onClose();
          } else if (e.key === "Escape") {
            cancelledRef.current = true;
            onClose();
          }
        }}
        className="w-[4ch] bg-transparent text-center outline-none"
      />
      <span className="pr-0.5">cm</span>
      <button
        type="button"
        aria-label="A millimetre wider"
        title="A millimetre wider"
        onClick={() => settle(snapWidth(current() + 0.1))}
        className={stepClass}
        style={{ width: control, height: control }}
      >
        <Plus className="h-1/2 w-1/2" />
      </button>
    </div>
  );
}

/**
 * A pair of compasses lying on a pane, drawn from the side like a real pair,
 * in true centimetres of the printed page. They sit in the container with the
 * pages, so they scroll and zoom with them.
 *
 * They're placed through usePlacedTool, with the needle as the point that's
 * placed and the angle pointing from the needle to the pencil. So dragging
 * the needle or either leg moves them at the same width, and the mouse wheel
 * turns them round the needle. The grip on the pencil's leg opens or closes
 * them while the needle stays put, snapping to whole millimetres.
 *
 * The needle and the pencil both snap onto points in the pen ink as they're
 * dragged near one: where two lines cross, the end of a line, or a dot. So a
 * construction can put the needle exactly where two arcs cross, and set the
 * width to exactly the length between two points. A ring shows the point
 * they've caught.
 *
 * The handle at the top turns them round the needle, and the pencil marks
 * everything it passes, up to one full circle, so going back over an arc
 * keeps it and carrying on past the start extends it. The compasses hand the
 * arc to the drawing layer of the page under the pencil, which draws it as one
 * change: in the picked pen, highlighter or fading ink, or in the colour
 * picked last when the Hand, the eraser or the lasso is picked.
 *
 * The button with the crossed-out pencil lifts the pencil off the page, so
 * the handle turns the compasses without drawing, such as to set where an arc
 * will begin. The pencil looks faded while it's lifted, and a second tap puts
 * it down again.
 *
 * The width shows above the handle, always the right way up, and a tap on it
 * opens it out into − and + buttons and a box to type a width, for setting it
 * exactly. Each board remembers the width the compasses were last left at.
 *
 * Like a real pair, they can work with the pencil on either side of the
 * needle. Whenever the pencil is on the left they're drawn mirrored, so the
 * hinge and the handle stay on top, and the button beside the hinge flips the
 * pencil to the other side of the needle without drawing.
 */
export function Compass({ containerRef, cm, start, darkMode, onHide }: CompassProps) {
  const [width, setWidth] = useState(readCompassWidth);
  const span = width * cm;
  const rise = hingeHeight(width) * cm;
  // The box runs from the needle across to the pencil, and up past the hinge to hold the turn handle.
  const boxHeight = rise + 1.5 * cm;

  const { toolRef, place, held, snapped: needleSnapped, onScreen, setPlace, handlers } = usePlacedTool({
    containerRef,
    // The needle starts left of the middle and below it, so the compasses stand centred on the start.
    start: [start[0] - span / 2, start[1] + rise / 2],
    // They turn round the needle from the handle at the top, so they leave out
    // `near`, and a second finger beside them isn't caught to turn them.
    snap: inkSnapAt,
  });
  // Whether the pencil has caught a point in the ink during this drag of its grip.
  const [pencilSnapped, setPencilSnapped] = useState(false);
  const [busy, setBusy] = useState(false);
  const inUse = held || busy;
  // Whether the pencil is lifted, so a turn of the handle draws nothing.
  const [lifted, setLifted] = useState(false);
  // Whether the width is opened out to be set exactly.
  const [settingWidth, setSettingWidth] = useState(false);
  // While any part is held, the compasses stay mirrored or not as they were
  // when it was grabbed, so the handle never jumps from under a finger part
  // way through a turn. They stand the right way up again when it lifts.
  const [heldMirror, setHeldMirror] = useState(false);
  const mirrored = inUse ? heldMirror : mirroredAt(place.angle);
  // A drag of the grip, with the width it has reached, which is remembered once the finger lifts.
  const gripRef = useRef<{ pointerId: number; offset: Vec; width: number } | null>(null);
  const turnRef = useRef<Turn | null>(null);

  /** The needle on screen, and a centimetre in screen pixels, or null before the container is on the page. */
  const measure = () => {
    const at = onScreen();
    return at && cm > 0 ? { needle: [at.cx, at.cy] as Vec, onScreenCm: cm * at.scale } : null;
  };

  /** Take a finger or the mouse on one of the handles. It returns false for the mouse's other buttons. */
  const grabHandle = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (!grabPointer(e)) return false;
    setHeldMirror(mirrored);
    setBusy(true);
    return true;
  };

  // The grip follows the finger with the pencil, so the pencil doesn't jump to where the finger is.
  const gripDown = (e: React.PointerEvent<HTMLSpanElement>) => {
    const m = measure();
    if (!m || !grabHandle(e)) return;
    const pencil = pointAt(m.needle, width * m.onScreenCm, place.angle);
    gripRef.current = { pointerId: e.pointerId, offset: [pencil[0] - e.clientX, pencil[1] - e.clientY], width };
  };

  const gripMove = (e: React.PointerEvent<HTMLSpanElement>) => {
    const grip = gripRef.current;
    const m = measure();
    if (!grip || grip.pointerId !== e.pointerId || !m) return;
    e.stopPropagation();
    const dragged: Vec = [e.clientX + grip.offset[0], e.clientY + grip.offset[1]];
    const widthTo = (point: Vec) => Math.hypot(point[0] - m.needle[0], point[1] - m.needle[1]) / m.onScreenCm;
    // A point the compasses can open to sets the width exactly. Anywhere else, the width snaps to a whole millimetre.
    const found = inkSnapAt(dragged);
    const caught = found && opensTo(widthTo(found)) ? found : null;
    const pencil = caught ?? dragged;
    setPencilSnapped(caught !== null);
    grip.width = caught ? widthTo(caught) : snapWidth(widthTo(dragged));
    setWidth(grip.width);
    setPlace({ cx: place.cx, cy: place.cy, angle: directionOf(m.needle, pencil) });
  };

  const gripUp = (e: React.PointerEvent<HTMLSpanElement>) => {
    const grip = gripRef.current;
    if (!grip || grip.pointerId !== e.pointerId) return;
    e.stopPropagation();
    saveCompassWidth(grip.width);
    gripRef.current = null;
    setPencilSnapped(false);
    setBusy(false);
  };

  const turnDown = (e: React.PointerEvent<HTMLSpanElement>) => {
    const m = measure();
    if (!m || !grabHandle(e)) return;
    turnRef.current = {
      pointerId: e.pointerId,
      last: directionOf(m.needle, [e.clientX, e.clientY]),
      swept: 0,
      range: [0, 0],
      from: place.angle,
      started: false,
      draws: !lifted,
      line: null,
    };
  };

  const turnMove = (e: React.PointerEvent<HTMLSpanElement>) => {
    const turn = turnRef.current;
    const m = measure();
    if (!turn || turn.pointerId !== e.pointerId || !m) return;
    e.stopPropagation();
    const direction = directionOf(m.needle, [e.clientX, e.clientY]);
    turn.swept = addTurn(turn.swept, turn.last, direction);
    turn.last = direction;
    turn.range = sweepRange(turn.range, turn.swept);
    setPlace({ cx: place.cx, cy: place.cy, angle: turn.from + turn.swept });
    const radius = width * m.onScreenCm;
    const [low, high] = turn.range;
    // The pencil only touches the page once the compasses have really turned,
    // so a tap on the handle leaves no mark, and a lifted pencil never does.
    if (!turn.started && high - low >= 1) {
      turn.started = true;
      const pencil = pointAt(m.needle, radius, turn.from);
      turn.line = turn.draws ? inkPageAt(pencil)?.startLine(pencil) ?? null : null;
    }
    // The arc covers everything the pencil has passed over, not just the way back to where the turn began.
    turn.line?.to(arcPoints(m.needle, radius, turn.from + low, turn.from + high));
  };

  const turnUp = (e: React.PointerEvent<HTMLSpanElement>) => {
    const turn = turnRef.current;
    if (!turn || turn.pointerId !== e.pointerId) return;
    e.stopPropagation();
    turnRef.current = null;
    turn.line?.end();
    setBusy(false);
  };

  // The pencil swings round to the other side of the needle, at the same width, and draws nothing.
  const flip = () => setPlace({ cx: place.cx, cy: place.cy, angle: (place.angle + 180) % 360 });

  // The drawing, in the box's own pixels, with the needle at its bottom-left
  // corner and the pencil at its bottom-right. Mirrored, the box is flipped
  // over the line between them, so the hinge ends up on the other side.
  const needle: Vec = [0, boxHeight];
  const pencil: Vec = [span, boxHeight];
  const hinge: Vec = [span / 2, boxHeight - rise];
  const knob: Vec = [span / 2, boxHeight - rise - 0.9 * cm];
  const grip = along(pencil, hinge, 2.1 * cm);
  const needleShoulder = along(needle, hinge, 0.6 * cm);
  const pencilShoulder = along(pencil, hinge, 1.3 * cm);
  const lead = along(pencil, hinge, 0.35 * cm);
  const legColour = inUse ? "#a0704b" : "#6b5a42";
  // Which end has caught a point in the ink during this drag, for the ring that shows it.
  const snapped = needleSnapped ? "needle" : pencilSnapped ? "pencil" : null;
  // The buttons' icons turn back against the compasses, so an X never looks like a plus.
  const upright = `${mirrored ? "scaleY(-1) " : ""}rotate(${-place.angle}deg)`;

  // The width sits beyond the turn handle, outside the turned box, so it always reads upright.
  const turnRadians = (place.angle * Math.PI) / 180;
  const labelOut = (rise + 2 * cm) * (mirrored ? -1 : 1);
  const labelAt: Vec = [
    place.cx + (span / 2) * Math.cos(turnRadians) + labelOut * Math.sin(turnRadians),
    place.cy + (span / 2) * Math.sin(turnRadians) - labelOut * Math.cos(turnRadians),
  ];

  return (
    <>
      <div
        ref={toolRef}
        role="group"
        aria-label={LABEL}
        title={LABEL}
        data-touch-owner=""
        {...handlers}
        // A new drag keeps the way up the compasses have now.
        onPointerDown={(e) => {
          setHeldMirror(mirrored);
          handlers.onPointerDown(e);
        }}
        // The box itself lets touches through, and the legs and handles inside it take them.
        className={cn("pointer-events-none absolute z-10 touch-none select-none", held ? "cursor-grabbing" : "cursor-grab")}
        style={{
          left: place.cx,
          top: place.cy - boxHeight,
          width: span,
          height: boxHeight,
          transform: `rotate(${place.angle}deg)${mirrored ? " scaleY(-1)" : ""}`,
          transformOrigin: `0px ${boxHeight}px`,
          filter: darkMode ? PDF_DARK_FILTER : undefined,
        }}
      >
        <svg
          aria-hidden="true"
          width={span}
          height={boxHeight}
          className="absolute left-0 top-0 overflow-visible"
          style={{ pointerEvents: "none", filter: "drop-shadow(0 6px 10px rgba(46, 30, 14, 0.25))" }}
        >
          {/* Wide, clear strokes along both legs take the touches that move the compasses */}
          <line x1={hinge[0]} y1={hinge[1]} x2={needle[0]} y2={needle[1]} stroke="transparent" strokeWidth={cm} style={{ pointerEvents: "stroke" }} />
          <line x1={hinge[0]} y1={hinge[1]} x2={pencil[0]} y2={pencil[1]} stroke="transparent" strokeWidth={cm} style={{ pointerEvents: "stroke" }} />
          {/* The stem up to the turn handle */}
          <line x1={hinge[0]} y1={hinge[1]} x2={knob[0]} y2={knob[1]} stroke={legColour} strokeWidth={0.12 * cm} strokeLinecap="round" />
          {/* The needle's leg, ending in a steel point */}
          <line x1={hinge[0]} y1={hinge[1]} x2={needleShoulder[0]} y2={needleShoulder[1]} stroke={legColour} strokeWidth={0.28 * cm} strokeLinecap="round" />
          <line x1={needleShoulder[0]} y1={needleShoulder[1]} x2={needle[0]} y2={needle[1]} stroke="#64748b" strokeWidth={0.07 * cm} strokeLinecap="round" />
          {/* The pencil's leg, holding a pencil with its lead at the tip. The pencil looks faded while it's lifted */}
          <line x1={hinge[0]} y1={hinge[1]} x2={pencilShoulder[0]} y2={pencilShoulder[1]} stroke={legColour} strokeWidth={0.28 * cm} strokeLinecap="round" />
          <g data-pencil={lifted ? "lifted" : "down"} opacity={lifted ? 0.35 : 1}>
            <line x1={pencilShoulder[0]} y1={pencilShoulder[1]} x2={lead[0]} y2={lead[1]} stroke="#e2b25c" strokeWidth={0.3 * cm} />
            <line x1={lead[0]} y1={lead[1]} x2={pencil[0]} y2={pencil[1]} stroke="#2e251c" strokeWidth={0.12 * cm} strokeLinecap="round" />
          </g>
          <circle cx={hinge[0]} cy={hinge[1]} r={0.32 * cm} fill="#2e251c" style={{ pointerEvents: "visiblePainted" }} />
          {/* A ring round the point in the ink that the needle or the pencil has caught */}
          {snapped && (
            <circle
              data-snapped={snapped}
              cx={snapped === "needle" ? needle[0] : pencil[0]}
              cy={boxHeight}
              r={0.3 * cm}
              fill="none"
              stroke="#2563eb"
              strokeWidth={Math.max(2, 0.06 * cm)}
            />
          )}
        </svg>

        {/* The grip on the pencil's leg opens and closes the compasses */}
        <span
          data-tool-handle=""
          role="img"
          aria-label="Drag to open or close"
          title="Drag to open or close"
          onPointerDown={gripDown}
          onPointerMove={gripMove}
          onPointerUp={gripUp}
          onPointerCancel={gripUp}
          className="pointer-events-auto absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center cursor-move"
          style={{ left: grip[0], top: grip[1], width: cm, height: cm }}
        >
          <i className={HANDLE_DOT} />
        </span>

        {/* The handle at the top turns the compasses round the needle, and the pencil draws as it turns unless it's lifted */}
        <span
          data-tool-handle=""
          role="img"
          aria-label={lifted ? "Turn without drawing" : "Turn to draw"}
          title={lifted ? "Turn without drawing" : "Turn to draw"}
          onPointerDown={turnDown}
          onPointerMove={turnMove}
          onPointerUp={turnUp}
          onPointerCancel={turnUp}
          className="pointer-events-auto absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center cursor-grab"
          style={{ left: knob[0], top: knob[1], width: cm, height: cm }}
        >
          <i className="block h-5 w-5 rounded-full border-2 border-[#a0704b] bg-white shadow" />
        </span>

        <button
          type="button"
          aria-label="Lift the pencil"
          aria-pressed={lifted}
          title={lifted ? "Put the pencil down, so turning draws again" : "Lift the pencil, so turning doesn't draw"}
          onClick={() => setLifted((up) => !up)}
          className={cn(BUTTON_CLASS, lifted && "bg-[#a0704b] text-white hover:bg-[#8a5f3f]")}
          style={{ left: hinge[0] - 2.2 * cm, top: hinge[1], width: 0.8 * cm, height: 0.8 * cm }}
        >
          <PencilOff className="h-1/2 w-1/2" style={{ transform: upright }} />
        </button>
        <button
          type="button"
          aria-label="Flip to the other side"
          title="Flip to the other side"
          onClick={flip}
          className={BUTTON_CLASS}
          style={{ left: hinge[0] - 1.1 * cm, top: hinge[1], width: 0.8 * cm, height: 0.8 * cm }}
        >
          <FlipHorizontal2 className="h-1/2 w-1/2" style={{ transform: upright }} />
        </button>
        <button
          type="button"
          aria-label="Hide the compasses"
          title="Hide the compasses"
          onClick={onHide}
          className={BUTTON_CLASS}
          style={{ left: hinge[0] + 1.1 * cm, top: hinge[1], width: 0.8 * cm, height: 0.8 * cm }}
        >
          <X className="h-1/2 w-1/2" style={{ transform: upright }} />
        </button>
      </div>

      {settingWidth ? (
        <WidthStepper
          at={labelAt}
          width={width}
          cm={cm}
          darkMode={darkMode}
          onChange={(next) => {
            setWidth(next);
            saveCompassWidth(next);
          }}
          onClose={() => setSettingWidth(false)}
        />
      ) : (
        <button
          type="button"
          data-touch-owner=""
          aria-label={`Width ${width.toFixed(1)} cm, tap to set it exactly`}
          title="Tap to set the width exactly"
          onClick={() => setSettingWidth(true)}
          className={cn("absolute z-10 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap hover:bg-[#2e251c]", READING)}
          style={{ left: labelAt[0], top: labelAt[1], filter: darkMode ? PDF_DARK_FILTER : undefined }}
        >
          {width.toFixed(1)} cm
        </button>
      )}
    </>
  );
}
