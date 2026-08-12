"use client";

/**
 * Shared primitives for the admin course-config editors (summer + regular).
 * Pure presentation/util helpers with zero course-season semantics — anything
 * summer- or regular-specific stays in the respective editor component.
 */

import { useState, useEffect, useCallback } from "react";
import { ChevronDown, GripVertical, Plus, X } from "lucide-react";
import { Reorder, useDragControls, type DragControls } from "framer-motion";

// Helper to format date strings for input[type=date] and input[type=datetime-local]
export function toDateInput(val: string | null | undefined): string {
  if (!val) return "";
  return val.slice(0, 10);
}
export function toDatetimeInput(val: string | null | undefined): string {
  if (!val) return "";
  return val.slice(0, 16);
}

export const ALL_DAYS = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

export const TIME_SLOT_PATTERN = /^\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}$/;

// Stable ID generator for Reorder items (prevents flashing during drag)
let _idCounter = 0;
export function genId(prefix: string) { return `${prefix}-${Date.now()}-${++_idCounter}`; }

export type WithId<T> = T & { _id: string };
export function stampIds<T>(items: T[], prefix: string): WithId<T>[] {
  return items.map(item => ({ ...item, _id: genId(prefix) }));
}

/** Undo stampIds on the way out. `_id` is a drag-handle key regenerated on
 *  every load, so it means nothing once stored — call this on any list headed
 *  for the API, or it lands in the config JSON and outlives the session. */
export function stripIds<T>(items: WithId<T>[]): T[] {
  return items.map(item => {
    const copy: Partial<WithId<T>> = { ...item };
    delete copy._id;
    return copy as T;
  });
}

export function reorderByIds<T extends { _id: string }>(items: T[], newOrder: string[]): T[] {
  const byId = new Map(items.map(item => [item._id, item]));
  return newOrder.map(id => byId.get(id)!);
}

/**
 * Everything in a stored JSON object that the editor has no field for.
 *
 * Both config editors assemble their JSON columns out of form state and save
 * the whole object, so a key with no field is deleted the next time anyone
 * saves. That is not hypothetical: the September 2026 regular intake lost the
 * flag that stops it collecting the materials fee, and Back to School
 * applicants were quoted $100 more than the offer promised. Keep what loaded
 * and spread this underneath what you assembled, and a rule the editor has
 * never heard of survives a save it was not part of.
 *
 * Pass the keys of the object the form assembles, so the two can never drift
 * apart. Everything else comes back, including values a truthiness check would
 * drop, such as `false` and `0`.
 */
export function unrenderedKeys(
  source: object | null | undefined,
  rendered: readonly string[],
): Record<string, unknown> {
  if (!source) return {};
  return Object.fromEntries(
    Object.entries(source).filter(([key]) => !rendered.includes(key))
  );
}

// Collapsible section component with status indicator
export function Section({
  title,
  subtitle,
  status,
  defaultOpen = false,
  forceOpen,
  onOpen,
  children,
}: {
  title: string;
  subtitle?: string;
  status?: { filled: boolean; count?: string };
  defaultOpen?: boolean;
  forceOpen?: boolean;
  onOpen?: () => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => { if (forceOpen) setOpen(true); }, [forceOpen]);
  const isOpen = forceOpen || open;
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => {
          const willOpen = !isOpen;
          setOpen(willOpen);
          if (willOpen && onOpen) onOpen();
        }}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800/50 text-sm font-semibold text-foreground hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        <span className="flex items-center gap-2">
          {status && (
            <span className={`w-2 h-2 rounded-full shrink-0 ${status.filled ? "bg-emerald-500" : "bg-amber-400"}`} />
          )}
          {title}
          {subtitle && (
            <span className="text-[10px] font-normal text-muted-foreground">{subtitle}</span>
          )}
          {status?.count && (
            <span className="text-[10px] font-normal text-muted-foreground">({status.count})</span>
          )}
        </span>
        <ChevronDown
          className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>
      {isOpen && <div className="p-4 space-y-4">{children}</div>}
    </div>
  );
}

// Reusable field label
export function Label({
  children,
  htmlFor,
}: {
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-xs font-medium text-muted-foreground mb-1"
    >
      {children}
    </label>
  );
}

// Reusable input class for editor fields. Named editorInputClass to avoid
// clashing with summer-utils' public-form inputClass.
export const editorInputClass =
  "w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-foreground text-sm disabled:opacity-50";

// Bilingual text field — paired ZH/EN inputs. Use multiline for textareas.
export function BilingualTextField({
  label,
  zhValue,
  enValue,
  onChangeZh,
  onChangeEn,
  placeholderZh,
  placeholderEn,
  disabled,
  multiline,
  minHeight = "40px",
}: {
  label: string;
  zhValue: string;
  enValue: string;
  onChangeZh: (v: string) => void;
  onChangeEn: (v: string) => void;
  placeholderZh?: string;
  placeholderEn?: string;
  disabled?: boolean;
  multiline?: boolean;
  minHeight?: string;
}) {
  const textareaStyle = { minHeight };
  const renderInput = (
    value: string,
    onChange: (v: string) => void,
    placeholder?: string,
  ) =>
    multiline ? (
      <AutoTextarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={editorInputClass}
        style={textareaStyle}
        disabled={disabled}
      />
    ) : (
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={editorInputClass}
        disabled={disabled}
      />
    );
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <Label>{label} (ZH)</Label>
        {renderInput(zhValue, onChangeZh, placeholderZh)}
      </div>
      <div>
        <Label>{label} (EN)</Label>
        {renderInput(enValue, onChangeEn, placeholderEn)}
      </div>
    </div>
  );
}

// Inline validation helper text
export function ValidationHint({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="text-xs text-red-500 mt-1">{message}</p>;
}

// Image thumbnail preview
export function ImagePreview({ url, className = "w-32 h-12" }: { url: string; className?: string }) {
  if (!url) return null;
  return (
    <div className={`mt-1.5 rounded border border-gray-200 dark:border-gray-700 overflow-hidden ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        className="w-full h-full object-cover"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = "none";
        }}
      />
    </div>
  );
}

// Auto-expanding textarea
export function AutoTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useCallback((el: HTMLTextAreaElement | null) => {
    if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; }
  }, []);
  return (
    <textarea
      {...props}
      ref={ref}
      onInput={(e) => {
        const t = e.currentTarget;
        t.style.height = "auto";
        t.style.height = t.scrollHeight + "px";
        props.onInput?.(e);
      }}
    />
  );
}

// Drag-and-drop reorderable item (same pattern as ExerciseModal)
export function ReorderableItem({ value, disabled, children }: {
  value: string;
  disabled?: boolean;
  children: (controls: DragControls | null) => React.ReactNode;
}) {
  const controls = useDragControls();
  return (
    <Reorder.Item value={value} dragListener={false}
      dragControls={disabled ? undefined : controls}
      className="select-none"
      style={{ listStyle: "none" }}>
      {children(disabled ? null : controls)}
    </Reorder.Item>
  );
}

export function DragHandle({ controls }: { controls: DragControls | null }) {
  if (!controls) return null;
  return (
    <div className="cursor-grab active:cursor-grabbing touch-none p-0.5 self-center"
      onPointerDown={(e) => controls.start(e)}>
      <GripVertical className="h-4 w-4 text-muted-foreground/40 hover:text-muted-foreground" />
    </div>
  );
}

// Inline time slot adder with native time pickers
export function TimeSlotAdder({ lastSlot, onAdd }: { lastSlot?: string; onAdd: (slot: string) => void }) {
  const [show, setShow] = useState(false);

  // Auto-suggest defaults based on last slot
  const getDefaults = () => {
    if (lastSlot) {
      const match = lastSlot.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
      if (match) {
        const endH = parseInt(match[3]);
        const endM = parseInt(match[4]);
        const startMin = endH * 60 + endM + 15;
        const newEndMin = startMin + 90;
        const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
        return { start: fmt(startMin), end: fmt(newEndMin) };
      }
    }
    return { start: "10:00", end: "11:30" };
  };

  const defaults = getDefaults();
  const [start, setStart] = useState(defaults.start);
  const [end, setEnd] = useState(defaults.end);

  if (!show) {
    return (
      <button type="button" onClick={() => { const d = getDefaults(); setStart(d.start); setEnd(d.end); setShow(true); }} className="inline-flex items-center gap-1 px-2 py-1 text-xs text-primary hover:text-primary-hover border border-dashed border-primary/40 rounded-md hover:border-primary/60">
        <Plus className="h-3 w-3" /> Add
      </button>
    );
  }

  return (
    <div className="inline-flex items-center gap-1.5">
      <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="px-1.5 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-foreground" />
      <span className="text-xs text-muted-foreground">to</span>
      <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="px-1.5 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-foreground" />
      <button type="button" onClick={() => {
        if (start && end && start < end) {
          onAdd(`${start} - ${end}`);
          setShow(false);
        }
      }} className="p-1 text-primary hover:text-primary-hover"><Plus className="h-3.5 w-3.5" /></button>
      <button type="button" onClick={() => setShow(false)} className="p-1 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
    </div>
  );
}
