import type { HomeworkCompletion } from "@/types";

/**
 * Whether a tutor has actually assessed this homework.
 *
 * The one definition. Badges, panel chips and recap counters all read it, so
 * they cannot drift apart or disagree with the backend's own rule.
 *
 * "Submitted" is not checked: the work came back, but nobody has marked it, so
 * it still needs a tutor. That is what keeps it in the backlog, ageing.
 */
export function isChecked(hw: Pick<HomeworkCompletion, "completion_status">): boolean {
  return (
    !!hw.completion_status &&
    hw.completion_status !== "Not Checked" &&
    hw.completion_status !== "Submitted"
  );
}

/** Handed in and sitting with a tutor, unmarked. The state worth nudging about. */
export function isAwaitingMarking(
  hw: Pick<HomeworkCompletion, "completion_status">
): boolean {
  return hw.completion_status === "Submitted";
}

/** How many of these have been checked. */
export function checkedCount(items: Pick<HomeworkCompletion, "completion_status">[]): number {
  return items.filter(isChecked).length;
}

/** How many are still waiting, which is what the counters on tabs and rows show. */
export function uncheckedCount(items: Pick<HomeworkCompletion, "completion_status">[]): number {
  return items.length - checkedCount(items);
}

/** How many are sitting with a tutor, handed in and still owed a verdict. */
export function awaitingMarkingCount(
  items: Pick<HomeworkCompletion, "completion_status">[]
): number {
  return items.filter(isAwaitingMarking).length;
}

/** Green once everything is done, orange while anything is still open. */
export function homeworkCountTone(checked: number, total: number): string {
  return checked >= total
    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
    : "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";
}

/** Tooltip for any checked/total indicator. One wording, wherever it appears. */
export function homeworkCountLabel(checked: number, total: number): string {
  const left = total - checked;
  return left <= 0
    ? "All homework checked"
    : `${left} homework item${left === 1 ? "" : "s"} still to check`;
}

/** Where a homework item came from: "Tue 3 Aug · Ms Other". */
export function assignedLabel(hw: HomeworkCompletion): string {
  const parts: string[] = [];

  if (hw.homework_assigned_date) {
    const date = new Date(hw.homework_assigned_date);
    parts.push(
      date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
    );
  }
  if (hw.assigned_by_tutor) parts.push(hw.assigned_by_tutor);

  return parts.join(" · ");
}
