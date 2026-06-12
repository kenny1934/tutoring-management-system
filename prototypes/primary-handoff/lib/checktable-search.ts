import type { Checktable, ChecktableItem } from "@/lib/types";
import { objectiveForItemCode } from "@/lib/mock-data/courseware-objectives";

/** Build a search-filtered copy of a checktable, keeping only items whose code,
 *  chapter title, or set objective matches the query (so searching by what a
 *  worksheet teaches surfaces it too; both parts of a set share the objective,
 *  so a match keeps the whole set). Empty rows and sections are dropped so the
 *  list stays compact. Returns the original table unchanged when the query is
 *  empty. Shared by the courseware browser and the student checktables tab so
 *  the two search the same way. */
export function filterTableBySearch(table: Checktable, query: string): Checktable {
  const q = query.trim().toLowerCase();
  if (!q) return table;

  const matchItem = (item: ChecktableItem, chapterTitle: string) =>
    item.code.toLowerCase().includes(q) ||
    chapterTitle.toLowerCase().includes(q) ||
    (objectiveForItemCode(item.code)?.toLowerCase().includes(q) ?? false);

  const sections = table.sections
    .map((sec) => {
      const chapters = sec.chapters
        .map((ch) => {
          const cells: typeof ch.cells = {};
          for (const sId of Object.keys(ch.cells)) {
            const cell = ch.cells[sId];
            const items = cell.items.filter((it) => matchItem(it, ch.title));
            if (items.length > 0) cells[sId] = { items };
          }
          return Object.keys(cells).length > 0 ? { ...ch, cells } : null;
        })
        .filter((ch): ch is NonNullable<typeof ch> => ch !== null);
      return chapters.length > 0 ? { ...sec, chapters } : null;
    })
    .filter((sec): sec is NonNullable<typeof sec> => sec !== null);

  const supplementary = table.supplementary.filter((it) =>
    matchItem(it, "補充教材 Supplementary")
  );

  return { ...table, sections, supplementary };
}
