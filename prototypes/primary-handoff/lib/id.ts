/** ID generation for client-side seeded entities (assignments, exercises,
 *  enrollments, sessions, contacts). Uses crypto.randomUUID() so collisions
 *  with existing seed ids are vanishingly unlikely. */
export function newId(prefix: string): string {
  const uuid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) +
        Math.random().toString(36).slice(2);
  return `${prefix}-${uuid.slice(0, 8)}`;
}
