/**
 * The reasons a geometry proof gives for its steps, from the centre's sheet
 * "F1-F3 證明題理由簡寫(中英)". A tutor picks one from the Pen Tray's list of
 * proof reasons and taps the page to place it, because writing a reason out by
 * hand on the board is slow, and writing it in Chinese is slower still.
 *
 * Each reason has its English abbreviation and its Chinese statement side by
 * side, as the sheet has them. A reason the sheet writes more than one way has
 * a line for each, and each line can be placed on its own. Chinese books tell
 * some reasons apart that English doesn't, such as 等弦對等劣弧 and 等弦對等優弧,
 * so those are rows of their own even where their English is the same. Many
 * Chinese statements have no English abbreviation, and a few English ones have
 * no Chinese, so one side can be empty.
 *
 * Letters that change from proof to proof are written in braces, with the
 * letters they start as. "alt. ∠s, {AB} // {CD}" asks for the letters of the
 * two parallel lines before it's placed, and starts them at AB and CD.
 */
import type { TextPart } from "./text-ink";

export interface ProofReason {
  /** Its English, a line for each way the sheet writes it. Empty when the sheet has none. */
  en: string[];
  /** Its Chinese, the same way. Empty when the sheet says 無. */
  zh: string[];
  /** The sheet's 解釋, which the list shows under the Chinese and never places. */
  note?: string;
  /** One of the sheet's yellow rows, which aren't in Mathematics in Action or MathSmart. */
  notInTextbooks?: true;
}

interface ReasonTopic {
  title: string;
  /** A short name for the topic's tab at the top of the list. */
  tab: string;
  /** Chinese names for the topic, which the search matches as well. They're never shown. */
  zhNames: string[];
  reasons: ProofReason[];
}

// A row of the sheet. The ways it writes one side are separated by "|".
const reason = (en: string, zh: string, extra: Omit<ProofReason, "en" | "zh"> = {}): ProofReason => ({
  en: en ? en.split("|") : [],
  zh: zh ? zh.split("|") : [],
  ...extra,
});
const yellow = { notInTextbooks: true } as const;
const SAME_CIRCLE = "在同圓（或等圓）中，";

export const PROOF_TOPICS: ReasonTopic[] = [
  {
    title: "Angles and parallel lines",
    tab: "Angles",
    zhNames: ["角", "平行線"],
    reasons: [
      reason("adj. ∠s on st. line", "補角定義|平角定義"),
      reason("∠s at a pt.", ""),
      reason("vert. opp. ∠s", "對頂角相等"),
      reason("corr. ∠s, {AB} // {CD}", "兩直線平行，同位角相等"),
      reason("alt. ∠s, {AB} // {CD}", "兩直線平行，內錯角相等"),
      reason("int. ∠s, {AB} // {CD}", "兩直線平行，同旁內角互補"),
      reason("corr. ∠s equal", "同位角相等，兩直線平行"),
      reason("alt. ∠s equal", "內錯角相等，兩直線平行"),
      reason("int. ∠s supp.", "同旁內角互補，兩直線平行"),
    ],
  },
  {
    title: "Triangles and polygons",
    tab: "Triangles",
    zhNames: ["三角形", "多邊形"],
    reasons: [
      reason("∠ sum of △", "三角形的內角和為180°"),
      reason("ext. ∠ of △", "三角形的外角等於與它不相鄰的兩內角之和"),
      reason("base ∠s, isos. △", "等邊對等角"),
      reason("sides opp. equal ∠s", "等角對等邊"),
      reason("base ∠s equal", "等腰三角形的底角相等", yellow),
      reason("def. of isos. △", "等腰三角形的定義", { note: "三角形中，至少兩條邊相等", ...yellow }),
      reason("def. of equil. △", "等邊三角形的定義", { note: "三角形中的三條邊都相等", ...yellow }),
      reason("prop. of isos. △", "等腰三角形三線合一"),
      reason("prop. of equil. △", "等邊三角形的三個內角都為60°"),
      reason("", "30°所對的邊是斜邊的一半"),
      reason("∠ sum of polygon", ""),
      reason("sum of ext. ∠s of polygon", "多邊形的外角和為360°"),
    ],
  },
  {
    title: "Congruent triangles",
    tab: "Congruent",
    zhNames: ["全等三角形"],
    reasons: [
      reason("common side", "公共邊"),
      reason("common ∠", "公共角"),
      reason("SSS|SAS|ASA|AAS|RHS", "SSS|SAS|ASA|AAS|RHS"),
      // Not on the sheet. Mainland textbooks use it where the sheet has RHS.
      reason("", "HL"),
      reason("corr. sides, ≅△s", "全等三角形的對應邊相等"),
      reason("corr. ∠s, ≅△s", "全等三角形的對應角相等"),
    ],
  },
  {
    title: "Similar triangles",
    tab: "Similar",
    zhNames: ["相似三角形"],
    reasons: [
      reason("AAA", "AAA"),
      reason("3 sides prop.", "三邊對應成比例的兩個三角形相似"),
      reason("ratio of 2 sides, inc. ∠", "兩邊對應成比例且夾角相等的兩個三角形相似"),
      reason("corr. sides, ~△s", "相似三角形的對應邊成比例"),
      reason("corr. ∠s, ~△s", "相似三角形的對應角相等"),
    ],
  },
  {
    title: "Pythagoras' theorem",
    tab: "Pythagoras",
    zhNames: ["勾股定理", "畢氏定理"],
    reasons: [
      reason("Pyth. theorem", "勾股定理"),
      reason("converse of Pyth. theorem", "勾股逆定理"),
    ],
  },
  {
    title: "Parallelograms",
    tab: "Parallelograms",
    zhNames: ["平行四邊形"],
    reasons: [
      reason("definition of //gram", "平行四邊形的兩組對邊平行"),
      reason("opp. sides of //gram", "平行四邊形的兩組對邊相等"),
      reason("opp. ∠s of //gram", "平行四邊形的兩組對角相等"),
      reason("diags. of //gram", "平行四邊形的對角線互相平分"),
      reason("", "平行四邊形的鄰角互補"),
      reason("", "兩組對邊分別平行的四邊形為平行四邊形"),
      reason("opp. sides equal", "兩組對邊相等的四邊形是平行四邊形"),
      reason("opp. ∠s equal", "兩組對角相等的四邊形是平行四邊形"),
      reason("diags. bisect each other", "對角線互相平分的四邊形是平行四邊形"),
      reason("opp. sides equal and //|2 sides // and equal", "一組對邊相等且平行的四邊形是平行四邊形"),
    ],
  },
  {
    title: "Rectangles, rhombuses and squares",
    tab: "Rectangles",
    zhNames: ["矩形", "長方形", "菱形", "正方形"],
    reasons: [
      reason("definition of rectangle", "矩形的四個角都為90°"),
      reason("prop. of rectangle", "矩形的性質", { note: "含平四性質，且對角線互相平分且相等" }),
      reason("", "有一個角為直角的平行四邊形為矩形"),
      reason("", "有三個角為直角的四邊形為矩形"),
      reason("", "對角線相等的平行四邊形為矩形"),
      reason("", "對角線相等且互相平分的四邊形為矩形"),
      reason("", "斜邊中線定理", { note: "Rt△中，斜邊上的中線為斜邊的一半" }),
      reason("definition of rhombus", "菱形的四條邊都相等"),
      reason("prop. of rhombus", "菱形的性質", { note: "含平四性質，且對角線互相垂直且平分一組對角" }),
      reason("", "一組鄰邊相等的平行四邊形為菱形"),
      reason("", "四邊相等的四邊形為菱形"),
      reason("", "對角線互相垂直且平分的四邊形為菱形"),
      reason("", "對角線互相垂直的平行四邊形為菱形"),
      reason("", "兩條對角線分別平分每組對角的四邊形為菱形"),
      reason("", "有一對角線平分一個內角的平行四邊形為菱形"),
      reason("definition of square", "正方形的四個角都為90°，且四邊都相等"),
      reason("prop. of square", "正方形的性質", { note: "含平四、矩形、菱形性質，且邊與對角線的夾角為45°" }),
    ],
  },
  {
    title: "Trapeziums, mid-points and intercepts",
    tab: "Trapeziums",
    zhNames: ["梯形", "中點", "中位線", "截線"],
    reasons: [
      // The sheet has 等腰三角形的定義 here, which is a slip for the trapezium.
      reason("def. of isos. trapezium", "等腰梯形的定義", { note: "兩條腰相等", ...yellow }),
      reason("prop. of isos. trapezium", "等腰梯形的性質", { note: "同一底上的兩個角相等、對角線相等", ...yellow }),
      reason("mid-pt. theorem", "中位線定理"),
      reason("intercept theorem", "截線定理|平行線分線段成比例定理"),
    ],
  },
  {
    title: "Bisectors",
    tab: "Bisectors",
    zhNames: ["平分線"],
    reasons: [
      reason("∠ bisector property|prop. of ∠ bisector", "角平分線定理|角平分線上的點到這個角的兩邊距離相等"),
      reason(
        "converse of ∠ bisector property|converse of prop. of ∠ bisector",
        "角平分線逆定理|到一個角的兩邊距離相等的點，在這個角的平分線上",
      ),
      reason("⊥ bisector property|prop. of ⊥ bisector", "垂直平分線定理|垂直平分線上的點到這條線段的兩個端點距離相等"),
      reason(
        "converse of ⊥ bisector property|converse of prop. of ⊥ bisector",
        "垂直平分線逆定理|到一條線段的兩端點距離相等的點，在這條線段的垂直平分線上",
      ),
    ],
  },
  {
    title: "Definitions and centres of a triangle",
    tab: "Centres",
    zhNames: ["內心", "重心", "垂心", "外心"],
    reasons: [
      reason("def. of ∠ bisector", "角平分線的定義"),
      reason("def. of ⊥ bisector", "垂直平分線的定義"),
      reason("def. of altitude", "垂直定義", yellow),
      reason("def. of median", "中線定義", yellow),
      reason("incentre of △", "", yellow),
      reason("centroid of △", "三角形重心定理", yellow),
      reason("orthocentre of △", "", yellow),
      reason("circumcentre of △", "", yellow),
    ],
  },
  {
    title: "Chords and arcs",
    tab: "Chords",
    zhNames: ["弦", "弧"],
    reasons: [
      reason("radii", "圓的所有半徑相等"),
      reason("⊥ from centre to chord bisects chord|line from centre ⊥ chord bisects chord", "垂徑定理"),
      reason("line joining centre to mid-pt. of chord ⊥ chord", "垂徑定理推論（平分不通過圓心的弦之直徑，必垂直於此弦並平分弦所對的兩條弧）"),
      reason("⊥ bisector of chord passes through centre", "弦的垂直平分線為圓的直徑"),
      reason("equal ∠s, equal chords", `${SAME_CIRCLE}等角對等弦`),
      reason("equal ∠s, equal arcs", `${SAME_CIRCLE}等角對等弧`),
      reason("equal arcs, equal chords", `${SAME_CIRCLE}等弧對等弦`),
      reason("equal arcs, equal ∠s", `${SAME_CIRCLE}等弧對等角`),
      reason("equal chords, equal ∠s", `${SAME_CIRCLE}等弦對等角`),
      // The minor arc and the major arc, which Chinese books tell apart.
      reason("equal chords, equal arcs", `${SAME_CIRCLE}等弦對等劣弧`),
      reason("equal chords, equal arcs", `${SAME_CIRCLE}等弦對等優弧`),
      reason("equal chords, equidistant from centre", `${SAME_CIRCLE}等弦對等弦心距`),
      reason("chords equidistant from centre are equal", `${SAME_CIRCLE}等弦心距對等弦`),
      reason("arcs prop. to ∠s at centre", "同圓中，弧長比等於圓心角度數之比"),
      // The sheet has 同圓總 here, which is a slip for 同圓中.
      reason("arcs prop. to ∠s at ⊙ᶜᵉ", "同圓中，弧長比等於圓周角度數之比"),
    ],
  },
  {
    title: "Angles in a circle",
    tab: "Circle angles",
    zhNames: ["圓周角", "圓心角"],
    reasons: [
      reason("∠ at centre twice ∠ at ⊙ᶜᵉ", "圓周角定理（在同圓或等圓中，一條弧所對的圓周角等於它所對的圓心角的一半）"),
      reason("∠s in the same segment", "圓周角推論：同弧或等弧所對的圓周角相等"),
      reason("", "圓周角推論：在同圓或等圓中，相等的圓周角所對的弧相等"),
      reason("∠ in semi-circle", "圓周角推論：直徑所對的圓周角是直角"),
      reason("converse of ∠ in semi-circle", "圓周角推論：90°的圓周角所對的弦是直徑"),
      reason("", "圓周角推論：圓周角的度數等於它所對的弧的度數的一半"),
      // These two are at the very end of the sheet.
      reason("", "圓內角度數等於其所夾兩弧度數和的一半"),
      reason("", "圓外角度數等於其所夾兩弧度數差的一半"),
    ],
  },
  {
    title: "Cyclic quadrilaterals and tangents",
    tab: "Cyclic",
    zhNames: ["圓內接四邊形", "切線"],
    reasons: [
      reason("opp. ∠s, cyclic quad.", "圓內接四邊形的對角互補"),
      reason("ext. ∠, cyclic quad.", "圓內接四邊形的外角等於內對角"),
      reason("converse of tangent ⊥ radius", "切線的判定：經過半徑的外端並且垂直於這條半徑的直線是圓的切線"),
      // The brackets are part of these three reasons, because they're what tells them apart.
      reason("tangent ⊥ radius", "切線的性質（圓的切線垂直於過切點的半徑）"),
      reason("", "切線的性質（經過圓心且垂直於切線的直線必經過切點）"),
      reason(
        "⊥ to tangent at its point of contact passes through centre|line ⊥ tangent at pt. of contact passes through centre",
        "切線的性質（經過切點且垂直於切線的直線必經過圓心）",
      ),
      reason("tangent properties|tangents from ext. pt.", "切線長定理"),
      reason("∠ in alt. segment", "弦切角定理"),
      reason("converse of ∠ in alt. segment", "弦切角逆定理"),
      reason("", "相交弦定理"),
      reason("", "割線定理"),
      reason("", "切割線定理"),
    ],
  },
  {
    title: "Concyclic points",
    tab: "Concyclic",
    zhNames: ["共圓"],
    reasons: [
      reason("converse of ∠s in the same segment", "四點共圓判定：若四個頂點所連成同側共底的兩個三角形的頂角相等，則四點共圓"),
      reason("opp. ∠s supp.", "四點共圓判定：若四邊形對角互補，則四邊形為圓內接四邊形"),
      reason("ext. ∠ = int. opp. ∠", "四點共圓判定：若四邊形的外角等於內對角，則四邊形為圓內接四邊形"),
    ],
  },
];

/** Which column of the sheet a line is in. */
export type ReasonSide = "en" | "zh";

/** A set of letters in braces. Splitting a line on it gives its words, with each slot's letters between them. */
export const SLOT = /\{([^{}]*)\}/g;

/** The letters a line asks for, as it starts them. */
export function slotsIn(line: string): string[] {
  return [...line.matchAll(SLOT)].map((match) => match[1]);
}

/** A line with its letters filled in. A slot left blank keeps the letters it starts with. */
export function fillSlots(line: string, letters: readonly string[] = []): string {
  let i = 0;
  return line.replace(SLOT, (_, start: string) => letters[i++]?.trim() || start);
}

/** One line of a reason, which a tap places on its own, with its letters still to fill in. */
export interface ReasonLine {
  side: ReasonSide;
  line: string;
}

/** A line as text to place, with its letters filled in. English is set in italic, as the textbooks set it. */
export function reasonPart({ side, line }: ReasonLine, letters: readonly string[] = []): TextPart {
  return { text: fillSlots(line, letters), italic: side === "en" };
}

// Spaces, dots, commas and apostrophes are left out on both sides of a
// search, so "vert opp" finds "vert. opp. ∠s" and 兩直線平行內錯角 finds 兩直線平行，內錯角相等.
const squash = (text: string) => text.toLowerCase().replace(/[\s.,，']/g, "");

/** Whether a reason has the words searched for, already squashed, in its English, its Chinese or its note. */
function reasonMatches(reason: ProofReason, wanted: string): boolean {
  return [...reason.en, ...reason.zh, reason.note ?? ""].some((line) => squash(fillSlots(line)).includes(wanted));
}

/**
 * Whether a search, already squashed, is for a topic by its name. An English
 * name matches from the start of any of its words, so "angle" finds the
 * topics about angles without every topic about triangles. A Chinese name
 * matches anywhere in it, since Chinese has no spaces between its words.
 */
function topicMatches(topic: ReasonTopic, wanted: string): boolean {
  const fromAWord = (name: string) => {
    const words = name.split(/\s+/);
    return words.some((_, i) => squash(words.slice(i).join(" ")).startsWith(wanted));
  };
  return fromAWord(topic.title) || fromAWord(topic.tab) || topic.zhNames.some((name) => name.includes(wanted));
}

/**
 * The topics with the reasons that match a search, leaving out any topic with
 * none. A search for a topic's name, such as "congruent" or 全等, finds the
 * whole of that topic.
 */
export function searchReasons(query: string): ReasonTopic[] {
  const wanted = squash(query);
  if (!wanted) return PROOF_TOPICS;
  return PROOF_TOPICS.flatMap((topic) => {
    if (topicMatches(topic, wanted)) return [topic];
    const reasons = topic.reasons.filter((r) => reasonMatches(r, wanted));
    return reasons.length > 0 ? [{ ...topic, reasons }] : [];
  });
}

// Each laptop remembers the lines picked last, newest first, so the ones a
// proof keeps coming back to are a tap away at the top of the list.
const RECENT_KEY = "csm_proof_reasons_recent";
const RECENT_COUNT = 6;

const isLine = (value: unknown): value is ReasonLine => {
  const { side, line } = (value ?? {}) as Partial<ReasonLine>;
  return (side === "en" || side === "zh") && typeof line === "string";
};
// A line taken out of the list one day drops out of the recent lines too.
const inList = ({ side, line }: ReasonLine) => PROOF_TOPICS.some((topic) => topic.reasons.some((r) => r[side].includes(line)));

/** The lines picked last on this laptop, newest first. */
export function readRecentLines(): ReasonLine[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    if (!Array.isArray(saved)) return [];
    return saved.filter(isLine).filter(inList).map(({ side, line }) => ({ side, line })).slice(0, RECENT_COUNT);
  } catch {
    return [];
  }
}

/** Put a line first among the recent lines, and give them back. */
export function rememberRecentLine(picked: ReasonLine): ReasonLine[] {
  const others = readRecentLines().filter((r) => r.side !== picked.side || r.line !== picked.line);
  const recent = [{ side: picked.side, line: picked.line }, ...others].slice(0, RECENT_COUNT);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(recent)); } catch { /* private window or storage full */ }
  return recent;
}
