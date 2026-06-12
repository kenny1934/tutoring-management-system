"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { notFound, useParams } from "next/navigation";
import { usePrimaryStore } from "@/lib/store/PrimaryStore";
import { DEMO_DAY } from "@/lib/mock-data/sessions";
import { StudentDetailHeader } from "./StudentDetailHeader";
import { StudentTabStrip } from "./StudentTabStrip";
import { getPendingCount } from "./student-utils";
import { useStuckBottom } from "@/components/checktable/useStickyOffset";

export function StudentDetailShell({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const { students, sessions, assignments } = usePrimaryStore();
  const student = students.find((s) => s.id === id);
  if (!student) {
    notFound();
  }

  const sessionCount = sessions.filter((s) => s.student_id === student.id).length;
  const pending = getPendingCount(student.id, assignments);

  // Publish where this pinned header's bottom edge rests so a tab's own sticky
  // controls strip (and the content headers under it) can stack beneath it
  // instead of hiding behind it. Read in the checktables tab via `--ct-stick`.
  const headerRef = useRef<HTMLDivElement>(null);
  const headerBottom = useStuckBottom(headerRef);
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--ct-stick",
      `${headerBottom}px`
    );
    return () => {
      document.documentElement.style.removeProperty("--ct-stick");
    };
  }, [headerBottom]);

  // `--ct-stick` is the header's *parked* bottom (constant), right for parking
  // sticky offsets. But before the first scroll the page sits ~24px lower (main
  // padding "slack"), so the header's *live* bottom is taller until it parks. A
  // viewport-height panel (the docked assign rail) must size off this live value
  // or it overflows the fold at rest; publish it and track it on scroll.
  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    // The bottom only changes over the first ~24px of scroll (while the header
    // parks), then holds; skip the redundant writes the rest of the scroll.
    let last = -1;
    let settled = false;
    const write = (bottom: number) => {
      if (bottom === last) return;
      last = bottom;
      document.documentElement.style.setProperty("--ct-stick-live", `${bottom}px`);
    };
    const setLive = () => {
      // The header only shrinks (its bottom moves) over the first ~24px of
      // scroll, while it parks. Past a small margin it's fully stuck and its
      // bottom holds, so take one final reading on the way past and then skip
      // the per-frame layout read (getBoundingClientRect) for the rest of the
      // scroll; re-engage if we scroll back up into the parking zone.
      if (window.scrollY > 64) {
        if (settled) return;
        settled = true;
        write(Math.round(el.getBoundingClientRect().bottom));
        return;
      }
      settled = false;
      write(Math.round(el.getBoundingClientRect().bottom));
    };
    setLive();
    window.addEventListener("scroll", setLive, { passive: true });
    window.addEventListener("resize", setLive);
    return () => {
      window.removeEventListener("scroll", setLive);
      window.removeEventListener("resize", setLive);
      document.documentElement.style.removeProperty("--ct-stick-live");
    };
  }, []);

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "sessions", label: "Sessions", count: sessionCount },
    { id: "checktables", label: "Curriculum", count: pending },
    { id: "performance", label: "Performance" },
    { id: "assessments", label: "Assessments" },
    { id: "parent-comms", label: "Parent comms" },
    { id: "history", label: "History" },
  ];

  return (
    <div>
      {/* Identity + tabs stay pinned so you can always see which student you're
       *  assigning work to while scrolling a long checktable. Full-bleed bg
       *  (negative margins cancel the main padding) lets content scroll cleanly
       *  underneath; offset below the mobile nav bar on small screens. */}
      <div
        ref={headerRef}
        className="sticky top-[52px] lg:top-0 z-20 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pt-1 space-y-3 bg-ink-50 shadow-sm"
      >
        <StudentDetailHeader
          student={student}
          sessions={sessions}
          assignments={assignments}
          todayIso={DEMO_DAY}
        />
        <StudentTabStrip studentId={student.id} tabs={tabs} />
      </div>
      <div className="pt-4">{children}</div>
    </div>
  );
}
