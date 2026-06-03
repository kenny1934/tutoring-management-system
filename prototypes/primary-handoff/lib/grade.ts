/** Kindergarten in HK is split into K1/K2/K3, but the MC Drive Kindergarten
 *  worksheet books are all filed under a single "K" grade. Normalize a
 *  student's grade to the grade key the checktables use, so worksheet matching
 *  still resolves for K1/K2/K3 students. P1–P6 pass through unchanged. */
export function bookGrade(grade: string): string {
  return /^K[123]$/.test(grade) ? "K" : grade;
}
