"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { FlipHorizontal2, MoveDiagonal2, PencilOff, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { PDF_DARK_FILTER } from "@/hooks/usePdfDarkMode";
import { usePlacedTool } from "@/hooks/usePlacedTool";
import { useCompassPencil } from "@/hooks/useCompassPencil";
import { inkPageAt, inkSnapAt, type DrivenLine } from "@/hooks/useInkPages";
import {
  addTurn, arcPoints, directionOf, draggedLegs, hingeHeight, mirroredAt, opensTo, pointAt, readCompassLegs,
  readCompassWidth, saveCompassLegs, saveCompassWidth, snapWidth, sweepRange, typedWidth, widestFor,
} from "@/lib/compass";
import type { Vec } from "@/lib/stroke-select";
import { HANDLE_DOT, READING, ROUND_BUTTON, grabPointer, useCloseOnOutsideTap, useReadingInView } from "./ToolParts";
import { Stepper } from "./Stepper";

const LABEL =
  "Compasses: drag the needle to move them, drag the pencil to open or close them, and turn the handle at the top to draw";

const BUTTON_CLASS = cn("pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2", ROUND_BUTTON);

interface CompassProps {
  /** What the compasses lie in, such as the worksheet's stack of pages. They scroll and zoom along with it. */
  containerRef: RefObject<HTMLElement | null>;
  /**
   * The pane's scroller. The width's reading keeps to the part of the pane
   * it's showing, so it moves to the other side of the compasses when there's
   * no room for it beyond the handle. Left out, the reading always sits
   * beyond the handle.
   */
  viewportRef?: RefObject<HTMLElement | null>;
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
  /** How far the compasses have turned since the arc began. */
  swept: number;
  /** The stretch of the turn the pencil has passed over, as the lowest and highest amounts turned. */
  range: [number, number];
  /** Which way the compasses pointed when the arc began: when the handle was grabbed, or when the pencil was put down part way through. */
  from: number;
  /** Whether the compasses have turned a whole degree since the arc began, which is when the pencil touches the page. */
  started: boolean;
  /** Whether the pencil is down, so the turn draws. It changes when the pencil is lifted or put down part way through. */
  draws: boolean;
  line: DrivenLine | null;
}

interface WidthStepperProps {
  /** Where the width sits, in the container's own pixels. */
  at: Vec;
  width: number;
  /** How long the legs are, which sets how wide the compasses can open. */
  legs: number;
  /** A centimetre in the container's own pixels, which sizes the buttons for a finger. */
  cm: number;
  darkMode: boolean;
  onChange: (width: number) => void;
  onClose: () => void;
  /** Given the box, so the compasses can measure it and keep it in view. */
  measureRef: (el: HTMLElement | null) => void;
}

/**
 * The compasses' width, opened out so it can be set exactly. The − and +
 * buttons move it a millimetre at a time, which suits a finger at the board,
 * and the box takes a typed width. What's typed is kept between 0.5 cm and
 * the widest the legs allow, and snapped to a millimetre once Enter is
 * pressed or the box loses focus, and Escape closes the box and forgets it. A
 * tap anywhere else closes it too, and that tap is kept from the page, so
 * closing it with a pen picked never leaves a dot.
 */
function WidthStepper({ at, width, legs, cm, darkMode, onChange, onClose, measureRef }: WidthStepperProps) {
  const [typed, setTyped] = useState(width.toFixed(1));
  // A width changed from outside the box, such as by the grip still held
  // while the box opened, replaces what the box shows. Otherwise closing the
  // box would put back the width it opened with.
  const [shownWidth, setShownWidth] = useState(width);
  if (width !== shownWidth) {
    setShownWidth(width);
    setTyped(width.toFixed(1));
  }
  const boxRef = useRef<HTMLDivElement>(null);
  // Set once Escape has closed the box, so the box losing focus as it goes doesn't keep what was typed.
  const cancelledRef = useRef(false);
  // A width typed but not yet confirmed counts, so + straight after typing 6 goes to 6.1.
  const current = () => typedWidth(typed, legs) ?? width;
  const settle = (next: number) => {
    onChange(next);
    setTyped(next.toFixed(1));
  };

  // A tap elsewhere and Enter both keep what was typed, then close the box.
  const closeKeepingTyped = () => {
    settle(current());
    onClose();
  };
  useCloseOnOutsideTap(boxRef, closeKeepingTyped);

  const control = 0.8 * cm;
  const stepClass = "grid flex-none place-items-center rounded-full hover:bg-[#f3e7d3]/15";
  return (
    <div
      ref={(el) => {
        boxRef.current = el;
        measureRef(el);
      }}
      role="group"
      aria-label="Set the width"
      data-touch-owner=""
      // It opens out of the width's reading, so it keeps the reading's look, a
      // little darker, with its own buttons for padding.
      className={cn(READING, "absolute z-20 flex -translate-x-1/2 -translate-y-1/2 items-center p-0 bg-[#2e251c]/90 shadow-lg")}
      style={{ left: at[0], top: at[1], filter: darkMode ? PDF_DARK_FILTER : undefined }}
    >
      <Stepper
        text={typed}
        onTextChange={setTyped}
        onLess={() => settle(snapWidth(current() - 0.1, legs))}
        onMore={() => settle(snapWidth(current() + 0.1, legs))}
        onBlur={() => {
          if (!cancelledRef.current) settle(current());
        }}
        onEnter={closeKeepingTyped}
        onEscape={() => {
          cancelledRef.current = true;
          onClose();
        }}
        lessLabel="A millimetre narrower"
        moreLabel="A millimetre wider"
        boxLabel="Width in centimetres"
        unit={<span className="pr-0.5">cm</span>}
        buttonClassName={stepClass}
        buttonStyle={{ width: control, height: control }}
        inputClassName="w-[4ch] bg-transparent text-center outline-none"
      />
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
 * it down again. The u key does the same, through useCompassPencil, so a
 * tutor with a finger on the handle can lift or put down the pencil with the
 * other hand. Either way it takes effect at once: lifted part way through a
 * turn, the pencil leaves its arc where it is, and put down part way
 * through, it starts a fresh arc from where it is now.
 *
 * The width shows above the handle, always the right way up, and a tap on it
 * opens it out into − and + buttons and a box to type a width, for setting it
 * exactly. When there's no room above the handle, such as with the compasses
 * up at the top of the pane, the width shows below the needle and the pencil
 * instead. Each board remembers the width the compasses were last left at.
 *
 * The handle with diagonal arrows, part way up the needle's leg, makes the
 * compasses bigger or smaller. Their legs grow or shrink with the finger's
 * distance from the needle, from 5 cm to 12 cm, which changes how wide they
 * can open: up to 13 cm with the usual 7 cm legs, and up to 23 cm with the
 * longest. Legs made too short for the width close the compasses up to fit.
 * Each board remembers the size too.
 *
 * Like a real pair, they can work with the pencil on either side of the
 * needle. Whenever the pencil is on the left they're drawn mirrored, so the
 * hinge and the handle stay on top, and the button beside the hinge flips the
 * pencil to the other side of the needle without drawing.
 */
export function Compass({ containerRef, viewportRef, cm, start, darkMode, onHide }: CompassProps) {
  const [legs, setLegs] = useState(readCompassLegs);
  const [width, setWidth] = useState(() => readCompassWidth(readCompassLegs()));
  const span = width * cm;
  const rise = hingeHeight(width, legs) * cm;
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
  // A drag of the resize handle, measured by the finger's distance from the
  // needle on screen. It remembers the width it started at, so legs shortened
  // past the width and lengthened again in the same drag open back out to it.
  const resizeRef = useRef<{ pointerId: number; from: number; startLegs: number; startWidth: number; legs: number; width: number } | null>(null);
  // Whether any handle is held is worked out from the drags themselves each
  // time one starts or ends, so lifting one handle never counts as letting go
  // of another that's still held.
  const updateBusy = () => setBusy(gripRef.current !== null || turnRef.current !== null || resizeRef.current !== null);

  /** The needle on screen, and a centimetre in screen pixels, or null before the container is on the page. */
  const measure = () => {
    const at = onScreen();
    return at && cm > 0 ? { needle: [at.cx, at.cy] as Vec, onScreenCm: cm * at.scale } : null;
  };

  /**
   * Take a finger or the mouse on one of the handles, whose drag is kept in
   * `drag`. It returns false for the mouse's other buttons, and for a second
   * finger on a handle that's already held, which is kept from moving the
   * compasses as well.
   */
  const grabHandle = (e: React.PointerEvent<HTMLSpanElement>, drag: { readonly current: unknown }) => {
    if (drag.current !== null) {
      e.stopPropagation();
      return false;
    }
    if (!grabPointer(e)) return false;
    setHeldMirror(mirrored);
    return true;
  };

  // The grip follows the finger with the pencil, so the pencil doesn't jump to where the finger is.
  const gripDown = (e: React.PointerEvent<HTMLSpanElement>) => {
    const m = measure();
    if (!m || !grabHandle(e, gripRef)) return;
    const pencil = pointAt(m.needle, width * m.onScreenCm, place.angle);
    gripRef.current = { pointerId: e.pointerId, offset: [pencil[0] - e.clientX, pencil[1] - e.clientY], width };
    updateBusy();
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
    const caught = found && opensTo(widthTo(found), legs) ? found : null;
    const pencil = caught ?? dragged;
    setPencilSnapped(caught !== null);
    grip.width = caught ? widthTo(caught) : snapWidth(widthTo(dragged), legs);
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
    updateBusy();
  };

  const turnDown = (e: React.PointerEvent<HTMLSpanElement>) => {
    const m = measure();
    if (!m || !grabHandle(e, turnRef)) return;
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
    updateBusy();
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
    updateBusy();
  };

  // Hiding the compasses part way through a turn finishes its arc. Otherwise
  // the page under the pencil would go on waiting for the rest of the arc, and
  // take no more ink from the pens.
  useEffect(() => () => turnRef.current?.line?.end(), []);

  /**
   * Lifts the pencil, or puts it down again, from the button or the u key.
   * Part way through a turn it takes effect at once: the arc ends where the
   * pencil is, or a fresh one begins there, with the turn counted again from
   * nought so the new arc stops after one full circle of its own.
   */
  const toggleLifted = () => {
    const up = !lifted;
    setLifted(up);
    const turn = turnRef.current;
    if (!turn) return;
    if (up) {
      turn.line?.end();
      turn.line = null;
    } else {
      turn.from += turn.swept;
      turn.swept = 0;
      turn.range = [0, 0];
      turn.started = false;
    }
    turn.draws = !up;
  };
  // The u key reaches the pair shown or touched last, so a finger anywhere on these compasses claims it.
  const touched = useCompassPencil(toggleLifted);

  const resizeDown = (e: React.PointerEvent<HTMLSpanElement>) => {
    const m = measure();
    if (!m || !grabHandle(e, resizeRef)) return;
    const from = Math.hypot(e.clientX - m.needle[0], e.clientY - m.needle[1]);
    resizeRef.current = { pointerId: e.pointerId, from, startLegs: legs, startWidth: width, legs, width };
    updateBusy();
  };

  const resizeMove = (e: React.PointerEvent<HTMLSpanElement>) => {
    const drag = resizeRef.current;
    const m = measure();
    if (!drag || drag.pointerId !== e.pointerId || !m) return;
    e.stopPropagation();
    drag.legs = draggedLegs(drag.startLegs, drag.from, Math.hypot(e.clientX - m.needle[0], e.clientY - m.needle[1]));
    drag.width = Math.min(drag.startWidth, widestFor(drag.legs));
    setLegs(drag.legs);
    setWidth(drag.width);
  };

  const resizeUp = (e: React.PointerEvent<HTMLSpanElement>) => {
    const drag = resizeRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    e.stopPropagation();
    resizeRef.current = null;
    saveCompassLegs(drag.legs);
    saveCompassWidth(drag.width);
    updateBusy();
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
  // The resize handle sits a little over a third of the way up the needle's leg, so it moves out as the legs grow.
  const resizeAt = along(needle, hinge, 0.35 * legs * cm);
  const needleShoulder = along(needle, hinge, 0.6 * cm);
  const pencilShoulder = along(pencil, hinge, 1.3 * cm);
  const lead = along(pencil, hinge, 0.35 * cm);
  const legColour = inUse ? "#a0704b" : "#6b5a42";
  // Which end has caught a point in the ink during this drag, for the ring that shows it.
  const snapped = needleSnapped ? "needle" : pencilSnapped ? "pencil" : null;
  // The buttons' icons turn back against the compasses, so an X never looks like a plus.
  const upright = `${mirrored ? "scaleY(-1) " : ""}rotate(${-place.angle}deg)`;

  // The width sits beyond the turn handle, outside the turned box, so it
  // always reads upright. When that's out of view, such as with the handle up
  // at the top of the pane, it goes on the other side of the compasses
  // instead, just past the needle and the pencil.
  const turnRadians = (place.angle * Math.PI) / 180;
  const hingeSide = mirrored ? -1 : 1;
  const outFromPoints = (out: number): Vec => [
    place.cx + (span / 2) * Math.cos(turnRadians) + out * Math.sin(turnRadians),
    place.cy + (span / 2) * Math.sin(turnRadians) - out * Math.cos(turnRadians),
  ];
  const reading = useReadingInView(
    containerRef,
    viewportRef,
    outFromPoints((rise + 2 * cm) * hingeSide),
    outFromPoints(-1.2 * cm * hingeSide),
  );

  return (
    <>
      <div
        ref={toolRef}
        role="group"
        aria-label={LABEL}
        title={LABEL}
        data-touch-owner=""
        {...handlers}
        onPointerDownCapture={touched}
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

        {/* The handle on the needle's leg makes the compasses bigger or smaller. Its arrows set it apart from the grip */}
        <span
          data-tool-handle=""
          role="img"
          aria-label="Drag to resize"
          title="Drag to resize"
          onPointerDown={resizeDown}
          onPointerMove={resizeMove}
          onPointerUp={resizeUp}
          onPointerCancel={resizeUp}
          className="pointer-events-auto absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center cursor-nesw-resize"
          style={{ left: resizeAt[0], top: resizeAt[1], width: cm, height: cm }}
        >
          <i className="grid h-5 w-5 place-items-center rounded-full border-2 border-[#a0704b] bg-white text-[#a0704b]">
            <MoveDiagonal2 className="h-3 w-3" strokeWidth={2.5} />
          </i>
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
          title={lifted ? "Put the pencil down, so turning draws again (U)" : "Lift the pencil, so turning doesn't draw (U)"}
          onClick={toggleLifted}
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
          at={reading.at}
          measureRef={reading.ref}
          width={width}
          legs={legs}
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
          ref={reading.ref}
          type="button"
          data-touch-owner=""
          aria-label={`Width ${width.toFixed(1)} cm, tap to set it exactly`}
          title="Tap to set the width exactly"
          onPointerDownCapture={touched}
          onClick={() => setSettingWidth(true)}
          className={cn("absolute z-10 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap hover:bg-[#2e251c]", READING)}
          style={{ left: reading.at[0], top: reading.at[1], filter: darkMode ? PDF_DARK_FILTER : undefined }}
        >
          {width.toFixed(1)} cm
        </button>
      )}
    </>
  );
}
