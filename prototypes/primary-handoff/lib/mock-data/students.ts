import type { Student } from "../types";

export const students: Student[] = [
  {
    id: "s-001",
    name: "Chan Ho Yin",
    code: "1001",
    grade: "P6",
    school: "PCMS",
    hwLoad: "Normal",
  },
  {
    id: "s-002",
    name: "Wong Mei Ling",
    code: "1002",
    grade: "P4",
    school: "SPCS",
    hwLoad: "Many",
  },
  {
    id: "s-003",
    name: "Lee Tsz Kit",
    code: "1003",
    grade: "P2",
    school: "DGS",
    hwLoad: "Little",
  },
  {
    id: "s-004",
    name: "Ng Wing Yan",
    code: "1004",
    grade: "P1",
    school: "MCS",
    hwLoad: "Normal",
  },
  // P3 pair in Mr Lawrence Lee's parallel Tuesday class — gives the weekly
  // view a concurrent meeting (different tutor, overlapping time) so the
  // time-grid's side-by-side overlap layout has real data to render.
  {
    id: "s-005",
    name: "Cheung Ka Ho",
    code: "1005",
    grade: "P3",
    school: "SKH",
    hwLoad: "Normal",
  },
  {
    id: "s-006",
    name: "Lam Sze Wun",
    code: "1006",
    grade: "P3",
    school: "MGS",
    hwLoad: "Many",
  },
];
