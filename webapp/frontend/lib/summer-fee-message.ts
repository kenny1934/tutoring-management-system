// Phrasing mirrors routers/enrollments.py::format_fee_message so parents
// receive a consistent voice across regular and summer messages.

import type {
  SummerApplication,
  SummerApplicationSessionInfo,
  SummerCourseConfig,
  SummerPricingConfig,
} from "@/types";
import {
  LOCATION_TO_CODE,
  RESCHEDULED_STATUS,
  dayLabel,
  sortSessionsByDate,
} from "@/lib/summer-utils";
import type { DiscountResult } from "@/lib/summer-discounts";

export type SummerMessageLang = "zh" | "en";

type BranchInfo = { zhName: string; enName: string; bank: string };

// Kept in sync with the Python bank/location maps in
// routers/enrollments.py::format_fee_message.
const SECONDARY_BRANCHES: Record<string, BranchInfo> = {
  MSA: { zhName: "華士古分校", enName: "Vasco Center", bank: "185000380468369" },
  MSB: { zhName: "二龍喉分校", enName: "Flora Garden Center", bank: "185000010473304" },
};

const DAY_ORDER = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const DATE_INDENT = "                  ";

const DEFAULT_PAYMENT_TERMS_ZH =
  "請於第一堂或之前繳交學費。逾期繳費者，本中心將收取 $200 手續費，並保留權利拒絕學生上課。";
const DEFAULT_PAYMENT_TERMS_EN =
  "Please settle tuition on or before the first lesson. A $200 handling fee will be charged for late payment, and we reserve the right to refuse class attendance.";
const DEFAULT_TIER_LOCK_NOTE_ZH =
  "※ {tier_name}優惠須於 {deadline} 前繳費以鎖定折扣。";
const DEFAULT_TIER_LOCK_NOTE_EN =
  "* The {tier_name} discount must be paid by {deadline} to lock it in.";

function resolvePaymentTermsBlock(
  pricing: SummerPricingConfig | null | undefined,
  courseStart: string,
  discount: DiscountResult,
  lang: SummerMessageLang,
): string {
  const base = (
    lang === "zh"
      ? pricing?.payment_terms_zh ?? DEFAULT_PAYMENT_TERMS_ZH
      : pricing?.payment_terms_en ?? DEFAULT_PAYMENT_TERMS_EN
  ).replaceAll("{course_start}", formatDate(courseStart));

  const tierDeadline = discount.best?.conditions?.before_date;
  if (!tierDeadline) return base;

  const tierName =
    lang === "zh" ? discount.best?.name_zh : discount.best?.name_en;
  if (!tierName) return base;

  const tierLine = (
    lang === "zh"
      ? pricing?.tier_lock_note_zh ?? DEFAULT_TIER_LOCK_NOTE_ZH
      : pricing?.tier_lock_note_en ?? DEFAULT_TIER_LOCK_NOTE_EN
  )
    .replaceAll("{tier_name}", tierName)
    .replaceAll("{deadline}", formatDate(tierDeadline));

  return `${base}\n${tierLine}`;
}

function resolveBranch(loc: string | null | undefined): BranchInfo | null {
  if (!loc) return null;
  const code = LOCATION_TO_CODE[loc] ?? loc;
  return SECONDARY_BRANCHES[code] ?? null;
}

function bankBlock(branch: BranchInfo | null, lang: SummerMessageLang): string {
  if (lang === "zh") {
    const base = "銀行：中國銀行\n名稱：弘教數學教育中心";
    return branch ? `${base}\n號碼：${branch.bank}` : base;
  }
  const base = "Bank: Bank of China\nAccount Name: 弘教數學教育中心";
  return branch ? `${base}\nAccount Number: ${branch.bank}` : base;
}

// Derive the branch from placed sessions (where lessons are actually
// scheduled) rather than the applicant's preferred_location — placement
// can differ from preference. Uses the most common location across
// non-cancelled sessions; falls back to preferred_location when no
// session carries a location.
function placedLocation(app: SummerApplication): string | null | undefined {
  const counts = new Map<string, number>();
  for (const s of app.sessions ?? []) {
    if (s.session_status === "Cancelled") continue;
    if (!s.location) continue;
    counts.set(s.location, (counts.get(s.location) ?? 0) + 1);
  }
  if (counts.size === 0) return app.preferred_location;
  let best: string | null = null;
  let bestN = 0;
  for (const [loc, n] of counts) {
    if (n > bestN) { best = loc; bestN = n; }
  }
  return best;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return iso.replace(/-/g, "/");
}

function branchName(
  rawLocation: string | null | undefined,
  branch: BranchInfo | null,
  lang: SummerMessageLang,
): string {
  if (branch) return lang === "zh" ? branch.zhName : branch.enName;
  return rawLocation ?? "";
}

function groupBySlot(
  sessions: SummerApplicationSessionInfo[],
): SummerApplicationSessionInfo[][] {
  const groups = new Map<number, SummerApplicationSessionInfo[]>();
  for (const s of sessions) {
    const arr = groups.get(s.slot_id);
    if (arr) arr.push(s);
    else groups.set(s.slot_id, [s]);
  }
  return [...groups.values()]
    .map((g) => sortSessionsByDate(g))
    .sort((a, b) => {
      const ai = DAY_ORDER.indexOf(a[0].slot_day);
      const bi = DAY_ORDER.indexOf(b[0].slot_day);
      if (ai !== bi) return ai - bi;
      return a[0].time_slot.localeCompare(b[0].time_slot);
    });
}

function formatScheduleBlock(
  app: SummerApplication,
  lang: SummerMessageLang,
): string {
  const sessions = (app.sessions ?? []).filter(
    (s) => s.session_status !== "Cancelled",
  );
  if (sessions.length === 0) {
    return lang === "zh" ? "（尚未編排）" : "(Not yet placed)";
  }

  const groups = groupBySlot(sessions);
  const lines: string[] = [];
  let rescheduledCount = 0;

  for (const group of groups) {
    const first = group[0];
    const day = dayLabel(first.slot_day, lang);
    const count = group.length;
    lines.push(
      lang === "zh"
        ? `逢${day} ${first.time_slot} (共 ${count} 堂)`
        : `Every ${day} ${first.time_slot} (${count} lessons)`,
    );
    for (const s of group) {
      const isRes = s.session_status === RESCHEDULED_STATUS;
      if (isRes) rescheduledCount += 1;
      const marker = isRes
        ? lang === "zh"
          ? " (待補堂)"
          : " (pending make-up)"
        : "";
      const date = formatDate(s.lesson_date) || (lang === "zh" ? "(待定)" : "(TBD)");
      lines.push(`${DATE_INDENT}${date}${marker}`);
    }
  }

  if (rescheduledCount > 0) {
    const note =
      lang === "zh"
        ? `\n※ ${rescheduledCount} 堂待安排補堂，稍後通知新日期。`
        : `\n* ${rescheduledCount} lesson${rescheduledCount > 1 ? "s" : ""} pending make-up — new date${rescheduledCount > 1 ? "s" : ""} will be notified later.`;
    lines.push(note);
  }

  return lines.join("\n");
}

export function formatSummerSchedule(
  app: SummerApplication,
  lang: SummerMessageLang,
): string {
  const rawLoc = placedLocation(app);
  const branch = resolveBranch(rawLoc);
  const schedule = formatScheduleBlock(app, lang);
  const name = branchName(rawLoc, branch, lang);

  if (lang === "zh") {
    return `家長您好，以下是 MathConcept中學教室 暑期課程 之【上課安排】：

學生姓名：${app.student_name}
報名編號：${app.reference_code}
上課安排：
${schedule}

MathConcept 中學教室 (${name})`;
  }
  return `Dear Parent,

This is the class schedule for the MathConcept Secondary Academy Summer Course:

Student Name: ${app.student_name}
Reference: ${app.reference_code}
Schedule:
${schedule}

MathConcept Secondary Academy (${name})`;
}

export function formatSummerFeeMessage(
  app: SummerApplication,
  config: SummerCourseConfig,
  discount: DiscountResult,
  lang: SummerMessageLang,
): string {
  const pricing = config.pricing_config;
  const baseFee = pricing?.base_fee ?? 0;
  const rawLoc = placedLocation(app);
  const branch = resolveBranch(rawLoc);
  const schedule = formatScheduleBlock(app, lang);
  const name = branchName(rawLoc, branch, lang);
  const paymentTerms = resolvePaymentTermsBlock(
    pricing,
    config.course_start_date,
    discount,
    lang,
  );

  if (lang === "zh") {
    let feeLine = `費用： $${discount.finalFee.toLocaleString()}`;
    if (discount.best) {
      feeLine += ` (已折扣 $${discount.amount.toLocaleString()} — ${discount.best.name_zh}，原價為 $${baseFee.toLocaleString()})`;
    }
    return `家長您好，以下是 MathConcept中學教室 暑期課程 之【繳費提示訊息】：

學生姓名：${app.student_name}
報名編號：${app.reference_code}
上課安排：
${schedule}

${feeLine}

${paymentTerms}

家長可選擇以下繳費方式：
1. 交付現金 或
2. 把學費存入以下戶口，請於備註註明學生姓名及其編號，並發收條至中心微信群。
${bankBlock(branch, "zh")}

MathConcept 中學教室 (${name})`;
  }

  let feeLine = `Fee: $${discount.finalFee.toLocaleString()}`;
  if (discount.best) {
    feeLine += ` (Discounted $${discount.amount.toLocaleString()} — ${discount.best.name_en}, original price $${baseFee.toLocaleString()})`;
  }
  return `Dear Parent,

This is a payment reminder for the MathConcept Secondary Academy Summer Course:

Student Name: ${app.student_name}
Reference: ${app.reference_code}
Schedule:
${schedule}

${feeLine}

${paymentTerms}

Parents may choose one of the following payment methods:
1. Cash payment, or
2. Bank transfer to the following account. Please include the student name and reference in the remarks, and send the receipt to our center's WeChat group.
${bankBlock(branch, "en")}

MathConcept Secondary Academy (${name})`;
}
