import styles from "./NativePreview.module.css";

export function NativeChartPlaceholder({ kind }: { kind: "grade" | "school" }) {
  return <div className={styles.chartBody} aria-hidden="true">
    <div className={`${styles.chartPlot} flex items-center justify-center`}><div className="h-24 w-24 rounded-full shimmer-sepia" /></div>
    <div className={styles.chartLegend}>
      <div className={`${styles.chartReadout} flex-col items-start justify-center gap-2`}><div className="h-3 w-20 rounded shimmer-sepia" /><div className="h-3 w-16 rounded shimmer-sepia" /></div>
      <div className={styles.chartLegendRows}>
        {Array.from({ length: kind === "grade" ? 6 : 11 }, (_, i) => (
          <div key={i} className={`${styles.chartLegendRow} pointer-events-none`}>
            <div className="h-3 w-3 rounded shimmer-sepia" />
            <div className="h-3 w-24 max-w-full rounded shimmer-sepia" />
          </div>
        ))}
      </div>
    </div>
  </div>;
}

export function NativeChartLoading({ kind }: { kind: "grade" | "school" }) {
  return <div data-native-chart-interactive aria-busy="true" role="status" aria-label={`Loading ${kind} distribution`}>
    <div className="mb-4 flex h-8 items-center justify-between gap-4"><div className="h-5 w-36 rounded shimmer-sepia" /><div className="h-6 w-20 rounded shimmer-sepia" /></div>
    <NativeChartPlaceholder kind={kind} />
  </div>;
}
