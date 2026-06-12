import type { Checktable, ChecktableChapter } from "../types";

// Learning-journey order for the CA (Level 1&2) line, transcribed from the
// "CA Learning Plan FullList (version II)" CSVs. The CSV row order is the
// pedagogical sequence and it deliberately interleaves strands (e.g. Shapes
// comes after the first addition/subtraction arc, Length after subtraction
// within 20, Picture Graphs after subtraction within 40), so a learning plan
// must NOT group topics by strand — it follows this list. Each entry is a
// topic prefix (chapter-level set-code stem, e.g. "NA104" covers NA104A-R and
// PS.NA104A-F, which the merged-PS model already folds into one chapter row).

const LEVEL_1_JOURNEY = [
  "NA101", // Numbers to 10
  "NA102", // One-to-one Correspondence
  "NA103", // Number Bonds
  "NA104", // Addition within 10
  "NA105", // Subtraction within 10
  "NA106", // Number 0
  "NA107", // Relationship between Addition and Subtraction
  "MG101", // Shapes and Patterns
  "MG102", // Making Patterns with Shapes
  "NA108", // Ordinal Numbers and Position
  "NA109", // Numbers to 20
  "NA110", // Addition within 20
  "NA111", // Subtraction within 20
  "MG103", // Length
  "NA112", // Numbers to 40
  "NA113", // Addition within 40
  "NA114", // Subtraction within 40
  "ST101", // Picture Graphs
  "NA115", // Multiplication
  "NA116", // Division
  "MG104", // Time
  "NA117", // Numbers to 100
  "NA118", // Addition within 100
  "NA119", // Subtraction within 100
  "NA120", // Money
  "NA121", // Addition and Subtraction of Money
];

const LEVEL_2_JOURNEY = [
  "NA201", // Numbers to 1000
  "NA202", // Addition within 1000
  "NA203", // Subtraction within 1000 (incl. the CSV's "Addition and Subtraction within 1000" PS sets)
  "NA204", // Multiplication and Division
  "NA205", // Multiplication Tables of 2, 3, 4, 5 and 10
  "NA206", // Property of Multiplication
  "MG201", // Measuring in Metres or Centimetres
  "MG202", // Mass
  "MG203", // Measuring in Grams and Kilograms
  "NA207", // Money
  "MG204", // Shapes and Two-dimensional Figures
  "MG205", // Solids and Three-Dimensional Figures
  "MG206", // Making Patterns
  "NA208", // Fractions
  "NA209", // Comparing and Ordering Fractions
  "NA210", // Addition and Subtraction of Like Fractions
  "MG207", // Time
  "ST201", // Picture Graphs
  "MG208", // Volume
];

const JOURNEYS: Record<string, string[]> = {
  "Level 1": LEVEL_1_JOURNEY,
  "Level 2": LEVEL_2_JOURNEY,
};

/** Topic prefix for a chapter, from the first worksheet code found in its
 *  cells: "NA104A1" / "PS.NA104A1" -> "NA104". */
export function topicPrefixForChapter(
  ch: ChecktableChapter
): string | undefined {
  for (const cell of Object.values(ch.cells)) {
    for (const it of cell.items) {
      const m = it.code.replace(/^PS\./, "").match(/^[A-Z]{2}\d{3}/);
      if (m) return m[0];
    }
  }
  return undefined;
}

/** Ordered topic prefixes for a book's learning journey, or undefined for
 *  books that don't have one (everything outside the CA line). */
export function journeyForTable(table: Checktable): string[] | undefined {
  if (table.family !== "CA (Level 1&2)") return undefined;
  return JOURNEYS[table.levelLabel ?? ""];
}
