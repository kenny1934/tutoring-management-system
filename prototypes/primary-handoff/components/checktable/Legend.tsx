"use client";

export function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-ink-500">
      <span className="flex items-center gap-1.5">
        <span className="chip">601A</span>
        <span>Untouched</span>
      </span>
      <span className="flex items-center gap-1.5">
        <span className="chip" data-state="assigned">
          601A
        </span>
        <span>Assigned</span>
      </span>
      <span className="flex items-center gap-1.5">
        <span className="chip" data-state="done">
          601A
        </span>
        <span>Done</span>
      </span>
      <span className="flex items-center gap-1.5">
        <span className="chip" data-state="selected">
          601A
        </span>
        <span>In print batch</span>
      </span>
      <span className="text-ink-400 ml-auto">Click a chip to manage.</span>
    </div>
  );
}
