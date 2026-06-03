// ARCHIVED, these hand-coded textbooks are no longer wired into the app.
// The store now uses only the real MC Drive worksheet checktables
// (mock-data/mc-drive-checktables.ts). Kept for reference only; nothing
// imports this file.
import type { Checktable, ChecktableItem } from "../types";

// Scoped item builder. scope is unique per cell occurrence so the same bare
// code (e.g. "R", "P") in different chapters generates different item ids.
function items(
  scope: string,
  seriesId: string,
  codes: string[]
): ChecktableItem[] {
  return codes.map((code) => ({
    id: `${scope}/${seriesId}/${code}`,
    code,
    pdfPath: `\\\\Center\\Unofficial\\old math 1-6\\${code}.pdf`,
  }));
}

const SERIES = [
  { id: "math-1-6", label: "Math 1-6", hint: "Per-chapter primary exercises" },
  { id: "m1-6-rev", label: "M1-6_Rev", hint: "Revision sets, per chapter group" },
  { id: "c-rev", label: "C_Rev", hint: "Consolidated reviews, per semester half" },
  { id: "ps", label: "PS", hint: "Problem-solving sets, by topic" },
  { id: "extra", label: "Extra", hint: "Numbered supplementary exercises" },
];

// 現代小學中文版 六年級 V12 (P6), transcribed faithfully but simplified for
// prototype rendering. Real production data would be richer (e.g., M1-6_Rev
// cells row-spanning chapter groups, PS/Extra grouped by topic).
const p6ChineseV12: Checktable = {
  id: "ct-p6-zh-v12",
  textbook: "現代小學中文版",
  grade: "P6",
  version: "V12",
  updatedAt: "2025-06-20",
  basePath: "\\\\Center\\Unofficial\\old math 1-6",
  series: SERIES,
  sections: [
    {
      id: "term-1",
      label: "上學期",
      chapters: [
        {
          id: "t1-c1",
          number: 1,
          title: "分解因數和指數記數法",
          cells: {
            "math-1-6": { items: items("t1-c1", "math-1-6", ["640A", "R"]) },
            "m1-6-rev": { items: items("t1-c1", "m1-6-rev", ["6A01A"]) },
            "c-rev": { items: [] },
            ps: { items: items("t1-c1", "ps", ["Dec_÷ 608E", "Dec_÷ 612"]) },
            extra: { items: items("t1-c1", "extra", ["601", "636A"]) },
          },
        },
        {
          id: "t1-c2",
          number: 2,
          title: "百分數的認識",
          cells: {
            "math-1-6": {
              items: items("t1-c2", "math-1-6", ["607A", "607B", "607C", "R"]),
            },
            "m1-6-rev": { items: items("t1-c2", "m1-6-rev", ["6A01B"]) },
            "c-rev": { items: [] },
            ps: { items: items("t1-c2", "ps", ["Dec_÷ 609R"]) },
            extra: { items: items("t1-c2", "extra", ["602", "637B"]) },
          },
        },
        {
          id: "t1-c3",
          number: 3,
          title: "百分數和小數互化",
          cells: {
            "math-1-6": {
              items: items("t1-c3", "math-1-6", ["608C", "608D"]),
            },
            "m1-6-rev": { items: [] },
            "c-rev": { items: items("t1-c3", "c-rev", ["C_Rev_6F_A01"]) },
            ps: { items: [] },
            extra: { items: items("t1-c3", "extra", ["603", "638C"]) },
          },
        },
        {
          id: "t1-c4",
          number: 4,
          title: "百分數和分數互化",
          cells: {
            "math-1-6": {
              items: items("t1-c4", "math-1-6", ["608A", "608B"]),
            },
            "m1-6-rev": { items: items("t1-c4", "m1-6-rev", ["6A02A"]) },
            "c-rev": { items: [] },
            ps: { items: items("t1-c4", "ps", ["Dec_Mixed×÷ 650"]) },
            extra: { items: items("t1-c4", "extra", ["604", "639D"]) },
          },
        },
        {
          id: "t1-c5",
          number: 5,
          title: "分數、小數和百分數四則運算",
          cells: {
            "math-1-6": { items: items("t1-c5", "math-1-6", ["638A"]) },
            "m1-6-rev": { items: items("t1-c5", "m1-6-rev", ["6A02B"]) },
            "c-rev": { items: [] },
            ps: {
              items: items("t1-c5", "ps", [
                "Dec_Mixed×÷ 608",
                "Dec_Mixed×÷ 609R",
              ]),
            },
            extra: { items: items("t1-c5", "extra", ["605", "640E"]) },
          },
        },
        {
          id: "t1-c6",
          number: 6,
          title: "百分率的應用(一)",
          cells: {
            "math-1-6": {
              items: items("t1-c6", "math-1-6", [
                "609A",
                "609B",
                "609C",
                "609D",
                "P",
                "R",
              ]),
            },
            "m1-6-rev": { items: items("t1-c6", "m1-6-rev", ["6A03A"]) },
            "c-rev": { items: items("t1-c6", "c-rev", ["C_Rev_6F_A02"]) },
            ps: { items: [] },
            extra: { items: items("t1-c6", "extra", ["607", "642B"]) },
          },
        },
        {
          id: "t1-c7",
          number: 7,
          title: "百分率的應用(二)",
          cells: {
            "math-1-6": {
              items: items("t1-c7", "math-1-6", [
                "610A",
                "610B",
                "610C",
                "P",
                "609E",
                "R",
              ]),
            },
            "m1-6-rev": { items: items("t1-c7", "m1-6-rev", ["6A03B"]) },
            "c-rev": { items: [] },
            ps: { items: items("t1-c7", "ps", ["Dec_Mixed Ops 614R"]) },
            extra: { items: items("t1-c7", "extra", ["608", "643C"]) },
          },
        },
        {
          id: "t1-c8",
          number: 8,
          title: "正負數的認識",
          cells: {
            "math-1-6": { items: items("t1-c8", "math-1-6", ["650A"]) },
            "m1-6-rev": { items: items("t1-c8", "m1-6-rev", ["6A04A"]) },
            "c-rev": { items: [] },
            ps: { items: [] },
            extra: { items: items("t1-c8", "extra", ["609", "644D"]) },
          },
        },
        {
          id: "t1-c9",
          number: 9,
          title: "數線與正負數",
          cells: {
            "math-1-6": { items: items("t1-c9", "math-1-6", ["650B"]) },
            "m1-6-rev": { items: items("t1-c9", "m1-6-rev", ["6A04B"]) },
            "c-rev": { items: items("t1-c9", "c-rev", ["C_Rev_6F_A03"]) },
            ps: { items: items("t1-c9", "ps", ["Dec_Mixed Ops 615"]) },
            extra: { items: items("t1-c9", "extra", ["610", "645A"]) },
          },
        },
        {
          id: "t1-c10",
          number: 10,
          title: "圓的認識(一)",
          cells: {
            "math-1-6": {
              items: items("t1-c10", "math-1-6", ["516A", "516B", "R"]),
            },
            "m1-6-rev": { items: [] },
            "c-rev": { items: [] },
            ps: { items: items("t1-c10", "ps", ["Dec_Mixed Ops 616"]) },
            extra: { items: items("t1-c10", "extra", ["611", "646B"]) },
          },
        },
        {
          id: "t1-c11",
          number: 11,
          title: "圓的認識(二)",
          cells: {
            "math-1-6": {
              items: items("t1-c11", "math-1-6", ["654A", "R"]),
            },
            "m1-6-rev": { items: [] },
            "c-rev": { items: items("t1-c11", "c-rev", ["C_Rev_6F_A04"]) },
            ps: { items: items("t1-c11", "ps", ["Mixed Ops 617"]) },
            extra: { items: items("t1-c11", "extra", ["612", "647C"]) },
          },
        },
        {
          id: "t1-c12",
          number: 12,
          title: "圓的製作",
          cells: {
            "math-1-6": {
              items: items("t1-c12", "math-1-6", ["516C", "R"]),
            },
            "m1-6-rev": { items: [] },
            "c-rev": { items: [] },
            ps: { items: items("t1-c12", "ps", ["Mixed Ops 618"]) },
            extra: { items: items("t1-c12", "extra", ["613", "648A"]) },
          },
        },
        {
          id: "t1-c13",
          number: 13,
          title: "圓周(一)",
          cells: {
            "math-1-6": {
              items: items("t1-c13", "math-1-6", ["614A", "614B"]),
            },
            "m1-6-rev": { items: [] },
            "c-rev": { items: items("t1-c13", "c-rev", ["C_Rev_6F_MIXED_01"]) },
            ps: { items: items("t1-c13", "ps", ["Mixed Ops 619"]) },
            extra: { items: items("t1-c13", "extra", ["614", "649B"]) },
          },
        },
        {
          id: "t1-c14",
          number: 14,
          title: "圓周(二)",
          cells: {
            "math-1-6": {
              items: items("t1-c14", "math-1-6", ["614C", "614D", "P"]),
            },
            "m1-6-rev": { items: [] },
            "c-rev": { items: [] },
            ps: { items: items("t1-c14", "ps", ["Circumf. 656A"]) },
            extra: { items: items("t1-c14", "extra", ["615", "650C"]) },
          },
        },
        {
          id: "t1-c15",
          number: 15,
          title: "圓面積",
          cells: {
            "math-1-6": { items: items("t1-c15", "math-1-6", ["655A"]) },
            "m1-6-rev": { items: [] },
            "c-rev": { items: [] },
            ps: { items: items("t1-c15", "ps", ["Circumf. 657A"]) },
            extra: { items: items("t1-c15", "extra", ["616", "651D"]) },
          },
        },
        {
          id: "t1-c16",
          number: 16,
          title: "圓柱體和圓錐體的特性",
          cells: {
            "math-1-6": { items: [] },
            "m1-6-rev": { items: [] },
            "c-rev": { items: [] },
            ps: { items: items("t1-c16", "ps", ["Volume 657C"]) },
            extra: { items: items("t1-c16", "extra", ["617", "652A"]) },
          },
        },
        {
          id: "t1-c17",
          number: 17,
          title: "圓柱體的表面積和體積",
          cells: {
            "math-1-6": { items: items("t1-c17", "math-1-6", ["657B"]) },
            "m1-6-rev": { items: [] },
            "c-rev": { items: [] },
            ps: {
              items: items("t1-c17", "ps", [
                "Volume 657B",
                "Volume SGC626 A",
                "Volume SGC626 B",
              ]),
            },
            extra: { items: items("t1-c17", "extra", ["618", "653B"]) },
          },
        },
      ],
    },
    {
      id: "term-2",
      label: "下學期",
      chapters: [
        {
          id: "t2-c1",
          number: 1,
          title: "比",
          cells: {
            "math-1-6": {
              items: items("t2-c1", "math-1-6", ["634A", "634B", "634C", "P"]),
            },
            "m1-6-rev": { items: items("t2-c1", "m1-6-rev", ["6A05A"]) },
            "c-rev": { items: items("t2-c1", "c-rev", ["C_Rev_6S_A01"]) },
            ps: { items: items("t2-c1", "ps", ["Speed 621"]) },
            extra: { items: items("t2-c1", "extra", ["620", "655B"]) },
          },
        },
        {
          id: "t2-c2",
          number: 2,
          title: "比例",
          cells: {
            "math-1-6": {
              items: items("t2-c2", "math-1-6", ["635A", "635B", "635C"]),
            },
            "m1-6-rev": { items: items("t2-c2", "m1-6-rev", ["6A05B"]) },
            "c-rev": { items: [] },
            ps: { items: items("t2-c2", "ps", ["Speed 656A"]) },
            extra: { items: items("t2-c2", "extra", ["621", "656A"]) },
          },
        },
        {
          id: "t2-c3",
          number: 3,
          title: "正比例",
          cells: {
            "math-1-6": { items: items("t2-c3", "math-1-6", ["635D"]) },
            "m1-6-rev": { items: [] },
            "c-rev": { items: items("t2-c3", "c-rev", ["C_Rev_6S_A02"]) },
            ps: { items: items("t2-c3", "ps", ["Speed SGC626"]) },
            extra: { items: items("t2-c3", "extra", ["622", "657B"]) },
          },
        },
        {
          id: "t2-c4",
          number: 4,
          title: "反比例",
          cells: {
            "math-1-6": { items: items("t2-c4", "math-1-6", ["635F"]) },
            "m1-6-rev": { items: [] },
            "c-rev": { items: [] },
            ps: { items: [] },
            extra: { items: items("t2-c4", "extra", ["623", "658C"]) },
          },
        },
        {
          id: "t2-c5",
          number: 5,
          title: "圖形的縮放",
          cells: {
            "math-1-6": { items: items("t2-c5", "math-1-6", ["665A"]) },
            "m1-6-rev": { items: [] },
            "c-rev": { items: [] },
            ps: { items: items("t2-c5", "ps", ["Aver. 632"]) },
            extra: { items: items("t2-c5", "extra", ["624", "659D"]) },
          },
        },
        {
          id: "t2-c6",
          number: 6,
          title: "加減法、乘除法的關係",
          cells: {
            "math-1-6": {
              items: items("t2-c6", "math-1-6", ["666A", "R"]),
            },
            "m1-6-rev": { items: items("t2-c6", "m1-6-rev", ["6B01A"]) },
            "c-rev": { items: items("t2-c6", "c-rev", ["C_Rev_6S_B01"]) },
            ps: { items: items("t2-c6", "ps", ["Simple Eq. 633"]) },
            extra: { items: items("t2-c6", "extra", ["625", "660P"]) },
          },
        },
        {
          id: "t2-c7",
          number: 7,
          title: "簡易方程(一)",
          cells: {
            "math-1-6": {
              items: items("t2-c7", "math-1-6", [
                "622A",
                "622B",
                "622C",
                "622D",
                "R",
              ]),
            },
            "m1-6-rev": { items: [] },
            "c-rev": { items: [] },
            ps: { items: [] },
            extra: { items: items("t2-c7", "extra", ["626", "661A"]) },
          },
        },
        {
          id: "t2-c8",
          number: 8,
          title: "簡易方程(二)",
          cells: {
            "math-1-6": {
              items: items("t2-c8", "math-1-6", ["623A", "623B", "623C", "R"]),
            },
            "m1-6-rev": { items: items("t2-c8", "m1-6-rev", ["6B01B"]) },
            "c-rev": { items: items("t2-c8", "c-rev", ["C_Rev_6S_B02"]) },
            ps: { items: items("t2-c8", "ps", ["% 633"]) },
            extra: { items: items("t2-c8", "extra", ["627", "662B"]) },
          },
        },
        {
          id: "t2-c9",
          number: 9,
          title: "簡易方程應用題(一)",
          cells: {
            "math-1-6": {
              items: items("t2-c9", "math-1-6", ["624A", "624B", "P", "R"]),
            },
            "m1-6-rev": { items: [] },
            "c-rev": { items: [] },
            ps: { items: [] },
            extra: { items: items("t2-c9", "extra", ["628", "663C"]) },
          },
        },
        {
          id: "t2-c10",
          number: 10,
          title: "簡易方程應用題(二)",
          cells: {
            "math-1-6": {
              items: items("t2-c10", "math-1-6", [
                "CN506F",
                "CN506G",
                "CN506H",
                "CN506I",
                "PS",
                "R",
              ]),
            },
            "m1-6-rev": { items: [] },
            "c-rev": { items: items("t2-c10", "c-rev", ["C_Rev_6S_MIXED_01"]) },
            ps: { items: [] },
            extra: { items: items("t2-c10", "extra", ["629", "664D"]) },
          },
        },
        {
          id: "t2-c11",
          number: 11,
          title: "折扣",
          cells: {
            "math-1-6": {
              items: items("t2-c11", "math-1-6", [
                "#622A",
                "#622B",
                "#622C",
                "#622D",
                "P",
                "R",
              ]),
            },
            "m1-6-rev": { items: [] },
            "c-rev": { items: [] },
            ps: { items: items("t2-c11", "ps", ["Discounts 610"]) },
            extra: { items: items("t2-c11", "extra", ["630", "665A"]) },
          },
        },
        {
          id: "t2-c12",
          number: 12,
          title: "利息",
          cells: {
            "math-1-6": { items: items("t2-c12", "math-1-6", ["636A"]) },
            "m1-6-rev": { items: [] },
            "c-rev": { items: [] },
            ps: { items: [] },
            extra: { items: items("t2-c12", "extra", ["631", "666B"]) },
          },
        },
        {
          id: "t2-c13",
          number: 13,
          title: "可能性的估計",
          cells: {
            "math-1-6": {
              items: items("t2-c13", "math-1-6", ["662A", "662B", "662C*"]),
            },
            "m1-6-rev": { items: [] },
            "c-rev": { items: items("t2-c13", "c-rev", ["C_Rev_P6_Final_01"]) },
            ps: { items: [] },
            extra: { items: items("t2-c13", "extra", ["632", "667C"]) },
          },
        },
        {
          id: "t2-c14",
          number: 14,
          title: "水平和鉛垂",
          cells: {
            "math-1-6": { items: items("t2-c14", "math-1-6", ["645A"]) },
            "m1-6-rev": { items: [] },
            "c-rev": { items: [] },
            ps: { items: [] },
            extra: { items: items("t2-c14", "extra", ["633", "668B"]) },
          },
        },
        {
          id: "t2-c15",
          number: 15,
          title: "簡易測量",
          cells: {
            "math-1-6": { items: items("t2-c15", "math-1-6", ["646A"]) },
            "m1-6-rev": { items: [] },
            "c-rev": { items: [] },
            ps: { items: [] },
            extra: { items: items("t2-c15", "extra", ["634", "669C"]) },
          },
        },
        {
          id: "t2-c16",
          number: 16,
          title: "圓形統計圖",
          cells: {
            "math-1-6": {
              items: items("t2-c16", "math-1-6", ["659A", "659B"]),
            },
            "m1-6-rev": { items: [] },
            "c-rev": { items: [] },
            ps: { items: [] },
            extra: { items: items("t2-c16", "extra", ["635", "670"]) },
          },
        },
        {
          id: "t2-c17",
          number: 17,
          title: "統計圖的選用",
          cells: {
            "math-1-6": { items: items("t2-c17", "math-1-6", ["660A"]) },
            "m1-6-rev": { items: [] },
            "c-rev": { items: [] },
            ps: { items: [] },
            extra: { items: [] },
          },
        },
      ],
    },
  ],
  supplementary: [
    ...items("supp-01", "supp", ["529A", "529B", "529C", "529D", "#608E"]),
    ...items("supp-02", "supp", ["533#A", "533#B"]),
    ...items("supp-03", "supp", ["613A", "613B", "613C", "613D"]),
    ...items("supp-04", "supp", ["327A", "327B"]),
    ...items("supp-05", "supp", ["611A", "611B", "611C", "611D", "P"]),
    ...items("supp-06", "supp", ["621A", "621B", "621C", "621D"]),
    ...items("supp-07", "supp", ["632A", "632B", "632C"]),
    ...items("supp-08", "supp", ["633A", "633B", "633C"]),
  ],
};

// Stub second textbook so the switcher feels real.
const p6EnglishV3: Checktable = {
  id: "ct-p6-en-v3",
  textbook: "Modern Primary English Math",
  grade: "P6",
  version: "V3",
  updatedAt: "2025-08-12",
  basePath: "\\\\Center\\Unofficial\\old math 1-6 EN",
  series: SERIES,
  sections: [
    {
      id: "term-1-en",
      label: "Term 1",
      chapters: [
        {
          id: "en-t1-c1",
          number: 1,
          title: "Factors and Indices",
          cells: {
            "math-1-6": {
              items: items("en-t1-c1", "math-1-6", ["EN-101A", "EN-101B"]),
            },
            "m1-6-rev": {
              items: items("en-t1-c1", "m1-6-rev", ["EN-R01"]),
            },
            "c-rev": { items: [] },
            ps: { items: [] },
            extra: { items: items("en-t1-c1", "extra", ["EN-X01"]) },
          },
        },
        {
          id: "en-t1-c2",
          number: 2,
          title: "Percentages",
          cells: {
            "math-1-6": {
              items: items("en-t1-c2", "math-1-6", [
                "EN-102A",
                "EN-102B",
                "EN-102C",
              ]),
            },
            "m1-6-rev": { items: [] },
            "c-rev": { items: items("en-t1-c2", "c-rev", ["EN-CR01"]) },
            ps: { items: items("en-t1-c2", "ps", ["EN-PS-Perc-A"]) },
            extra: { items: items("en-t1-c2", "extra", ["EN-X02"]) },
          },
        },
      ],
    },
  ],
  supplementary: items("en-supp-01", "supp", ["EN-S01", "EN-S02"]),
};

// Stub P5 textbook for a different grade.
const p5ChineseV10: Checktable = {
  id: "ct-p5-zh-v10",
  textbook: "現代小學中文版",
  grade: "P5",
  version: "V10",
  updatedAt: "2024-08-15",
  basePath: "\\\\Center\\Unofficial\\old math 1-5",
  series: SERIES,
  sections: [
    {
      id: "p5-term-1",
      label: "上學期",
      chapters: [
        {
          id: "p5-t1-c1",
          number: 1,
          title: "整數的四則運算",
          cells: {
            "math-1-6": {
              items: items("p5-t1-c1", "math-1-6", ["540A", "540B"]),
            },
            "m1-6-rev": {
              items: items("p5-t1-c1", "m1-6-rev", ["5A01A"]),
            },
            "c-rev": { items: [] },
            ps: { items: [] },
            extra: { items: items("p5-t1-c1", "extra", ["501"]) },
          },
        },
      ],
    },
  ],
  supplementary: [],
};

export const checktables: Checktable[] = [
  p6ChineseV12,
  p6EnglishV3,
  p5ChineseV10,
];
