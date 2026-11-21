import { DashboardPlaceholder } from "@/components/dashboard/DashboardSkeletons";
import loadingStyles from "@/components/dashboard/DashboardSkeletons.module.css";
import styles from "./NativePreview.module.css";

export function NativeChartPlaceholder({ kind }: { kind: "grade" | "school" }) {
  return <div className={styles.chartBody} aria-hidden="true">
    <div className={`${styles.chartPlot} flex items-center justify-center`}><div className={loadingStyles.chartRing}><div className={loadingStyles.chartCenter}><DashboardPlaceholder className="h-5 w-8" /><DashboardPlaceholder className="h-2.5 w-12" /></div></div></div>
    <div className={styles.chartLegend}>
      <div className={`${styles.chartReadout} flex-col items-start justify-center gap-2`}><DashboardPlaceholder className="h-3 w-20" /><DashboardPlaceholder className="h-3 w-16" /></div>
      <div className={styles.chartLegendRows}>
        {Array.from({ length: kind === "grade" ? 6 : 11 }, (_, i) => (
          <div key={i} className={`${styles.chartLegendRow} pointer-events-none`}>
            <DashboardPlaceholder className="h-2 w-2" />
            <DashboardPlaceholder className="h-3 w-24 max-w-full" /><DashboardPlaceholder className="ml-auto h-3 w-6" />
          </div>
        ))}
      </div>
    </div>
  </div>;
}

export function NativeChartLoading({ kind }: { kind: "grade" | "school" }) {
  return <div data-native-chart-interactive aria-busy="true" role="status" aria-label={`Loading ${kind} distribution`}>
    <div data-native-chart-header className="mb-4 flex min-h-8 flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><DashboardPlaceholder className="h-6 w-8" /><h3 className="font-semibold">{kind === "grade" ? "Grade Distribution" : "School Distribution"}</h3></div><DashboardPlaceholder className="h-6 w-20 shrink-0" /></div>
    <NativeChartPlaceholder kind={kind} />
  </div>;
}
