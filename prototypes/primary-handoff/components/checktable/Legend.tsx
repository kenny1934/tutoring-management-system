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
      <span className="flex items-center gap-1.5">
        <span className="chip relative overflow-hidden">
          <span
            aria-hidden
            className="absolute left-0 top-0 bottom-0 w-1 bg-rose-500"
          />
          601A
        </span>
        <span>Classwork</span>
      </span>
      <span className="flex items-center gap-1.5">
        <span className="chip relative overflow-hidden">
          <span
            aria-hidden
            className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500"
          />
          601A
        </span>
        <span>Homework</span>
      </span>
      <span className="text-ink-400 ml-auto">Click a chip to manage.</span>
    </div>
  );
}
