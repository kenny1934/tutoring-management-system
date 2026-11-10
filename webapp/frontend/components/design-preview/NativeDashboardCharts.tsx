"use client";

import { type ReactNode } from "react";
import { motion } from "framer-motion";
import { Segmented } from "@/components/controls/segmented";
import { cn } from "@/lib/utils";
import { useNativePresentation } from "./useNativePresentation";
import { useNativeViewState } from "./NativeNavigationMemory";
import styles from "./NativePreview.module.css";

export function NativeDashboardCharts({ isMobile, grade, school, filter }: {
  isMobile: boolean;
  grade: ReactNode;
  school: ReactNode;
  filter?: ReactNode;
}) {
  const [selected, setSelected] = useNativeViewState<"grade" | "school">("dashboard:chart", () => "grade");
  const mode = useNativePresentation();
  const stacked = isMobile && mode === "motion";
  const Card = stacked ? "div" : motion.div;
  return <>
    {(isMobile || filter) && <div className={styles.chartToolbar}>
      {isMobile && <Segmented
        label="Which chart to show"
        value={selected}
        onChange={setSelected}
        options={[{ value: "grade", label: "By grade" }, { value: "school", label: "By school" }]}
      />}
      {filter}
    </div>}
    <div className={cn("grid gap-4 md:grid-cols-2", styles.chartDeck)} role="region" aria-label="Student analytics" data-native-depth-section data-native-chart-motion={stacked || undefined}>
      {([{ kind: "grade", content: grade }, { kind: "school", content: school }] as const).map(({ kind, content }, index) => {
        const active = selected === kind;
        if (isMobile && !stacked && !active) return null;
        return <Card key={kind}
          {...(stacked ? {} : { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { delay: index ? .3 : .25, duration: .3, ease: "easeOut" as const } })}
          data-native-layer={kind}
          data-native-chart-panel={kind}
          data-native-chart-active={stacked ? active : undefined}
          data-native-depth-surface
          aria-hidden={stacked && !active ? true : undefined}
          inert={stacked && !active}
          className={cn("relative min-w-0 bg-paper rounded-xl border border-line p-4 sm:p-6", !isMobile && "paper-texture", styles.chartPanel)}
        >{content}</Card>;
      })}
    </div>
  </>;
}
