import { describe, it, expect } from "vitest";
import {
  formatSummerSchedule,
  formatSummerFeeMessage,
} from "./summer-fee-message";
import type { DiscountResult } from "./summer-discounts";
import type {
  SummerApplication,
  SummerApplicationSessionInfo,
  SummerCourseConfig,
} from "@/types";

function makeSession(
  overrides: Partial<SummerApplicationSessionInfo> = {},
): SummerApplicationSessionInfo {
  return {
    id: 1,
    slot_id: 100,
    slot_day: "Monday",
    time_slot: "10:00 - 11:30",
    grade: "F1",
    tutor_name: null,
    session_status: "Tentative",
    lesson_number: 1,
    lesson_date: "2026-07-06",
    slot_max_students: 8,
    slot_current_count: 3,
    ...overrides,
  };
}

function makeApp(
  sessions: SummerApplicationSessionInfo[],
  overrides: Partial<SummerApplication> = {},
): SummerApplication {
  return {
    id: 42,
    config_id: 1,
    reference_code: "SC2026-ABC123",
    student_name: "陳小明",
    grade: "F1",
    preferred_location: "華士古分校",
    application_status: "Placement Confirmed",
    lessons_paid: 8,
    total_lessons: 8,
    sessions,
    ...overrides,
  } as SummerApplication;
}

function makeConfig(overrides: Partial<SummerCourseConfig> = {}): SummerCourseConfig {
  return {
    id: 1,
    year: 2026,
    title: "Summer 2026",
    application_open_date: "2026-04-01",
    application_close_date: "2026-06-15",
    course_start_date: "2026-07-05",
    course_end_date: "2026-08-30",
    total_lessons: 8,
    pricing_config: { base_fee: 1500 },
    locations: [],
    available_grades: [],
    time_slots: [],
    is_active: true,
    ...overrides,
  } as SummerCourseConfig;
}

const NO_DISCOUNT: DiscountResult = {
  best: null,
  amount: 0,
  finalFee: 1500,
  nearMiss: null,
};

const GROUP_DISCOUNT: DiscountResult = {
  best: {
    code: "3P",
    name_zh: "三人同行",
    name_en: "Group of 3+",
    amount: 300,
    conditions: { min_group_size: 3 },
  },
  amount: 300,
  finalFee: 1200,
  nearMiss: null,
};

const EB_GROUP_DISCOUNT: DiscountResult = {
  best: {
    code: "EB3",
    name_zh: "三人同行早鳥",
    name_en: "Early Bird Group of 3+",
    amount: 500,
    conditions: { min_group_size: 3, before_date: "2026-06-15" },
  },
  amount: 500,
  finalFee: 1000,
  nearMiss: null,
};

describe("formatSummerSchedule — 1x/week", () => {
  const app = makeApp([
    makeSession({ id: 1, lesson_number: 1, lesson_date: "2026-07-06" }),
    makeSession({ id: 2, lesson_number: 2, lesson_date: "2026-07-13" }),
    makeSession({ id: 3, lesson_number: 3, lesson_date: "2026-07-20" }),
  ]);

  it("renders a single 上課時間 line followed by a 上課日期 block (ZH)", () => {
    const out = formatSummerSchedule(app, "zh");
    expect(out).toContain("上課時間：逢星期一 10:00 - 11:30 (90分鐘)");
    expect(out).toContain("上課日期：");
    expect(out).toContain("                  2026/07/06");
    expect(out).toContain("                  2026/07/13");
    expect(out).toContain("                  2026/07/20");
    expect(out).toContain("                  (共 3 堂)");
    expect(out).not.toContain("待補堂");
  });

  it("renders the EN counterpart with Schedule/Lesson Dates headers", () => {
    const out = formatSummerSchedule(app, "en");
    expect(out).toContain("Schedule: Every Monday 10:00 - 11:30 (90 minutes)");
    expect(out).toContain("Lesson Dates:");
    expect(out).toContain("                  2026/07/06");
    expect(out).toContain("                  (3 lessons total)");
  });

  it("omits day-of-week suffix on dates in 1x mode", () => {
    const zh = formatSummerSchedule(app, "zh");
    expect(zh).not.toMatch(/2026\/07\/06 \([一二三四五六日]\)/);
    const en = formatSummerSchedule(app, "en");
    expect(en).not.toMatch(/2026\/07\/06 \(Mon\)/);
  });

  it("uses the correct bilingual branch footer", () => {
    const out = formatSummerSchedule(app, "zh");
    expect(out).toContain("MathConcept 中學教室 (華士古分校)");
  });
});

describe("formatSummerSchedule — 2x/week with rescheduled row", () => {
  const app = makeApp([
    makeSession({ id: 1, slot_id: 100, slot_day: "Monday", time_slot: "10:00 - 11:30", lesson_date: "2026-07-06" }),
    makeSession({ id: 2, slot_id: 100, slot_day: "Monday", time_slot: "10:00 - 11:30", lesson_date: "2026-07-13", session_status: "Rescheduled - Pending Make-up" }),
    makeSession({ id: 3, slot_id: 200, slot_day: "Thursday", time_slot: "14:30 - 16:00", lesson_date: "2026-07-09" }),
    makeSession({ id: 4, slot_id: 200, slot_day: "Thursday", time_slot: "14:30 - 16:00", lesson_date: "2026-07-16" }),
  ]);

  it("aggregates two indented time lines under Schedule: (EN)", () => {
    const out = formatSummerSchedule(app, "en");
    expect(out).toContain("Schedule:\n  Every Monday 10:00 - 11:30 (90 minutes)\n  Every Thursday 14:30 - 16:00 (90 minutes)");
    expect(out).toContain("Lesson Dates:");
    expect(out).toContain("                  (4 lessons total)");
  });

  it("merges dates chronologically with (Mon)/(Thu) suffixes (EN)", () => {
    const out = formatSummerSchedule(app, "en");
    const mondayDateIdx = out.indexOf("2026/07/06 (Mon)");
    const thursdayDateIdx = out.indexOf("2026/07/09 (Thu)");
    expect(mondayDateIdx).toBeGreaterThan(-1);
    expect(thursdayDateIdx).toBeGreaterThan(mondayDateIdx);
    expect(out).toContain("2026/07/13 (Mon) (pending make-up)");
  });

  it("aggregates two indented time lines under 上課時間 (ZH)", () => {
    const out = formatSummerSchedule(app, "zh");
    expect(out).toContain("上課時間：\n  逢星期一 10:00 - 11:30 (90分鐘)\n  逢星期四 14:30 - 16:00 (90分鐘)");
  });

  it("applies (一)/(四) suffixes on ZH dates and keeps 待補堂 marker", () => {
    const out = formatSummerSchedule(app, "zh");
    expect(out).toContain("2026/07/06 (一)");
    expect(out).toContain("2026/07/09 (四)");
    expect(out).toContain("2026/07/13 (一) (待補堂)");
    expect(out).toContain("                  (共 4 堂)");
  });

  it("uses the English branch name in the footer", () => {
    const out = formatSummerSchedule(app, "en");
    expect(out).toContain("MathConcept Secondary Academy (Vasco Center)");
  });
});

describe("formatSummerFeeMessage", () => {
  const app = makeApp([
    makeSession({ id: 1, lesson_date: "2026-07-06" }),
    makeSession({ id: 2, lesson_date: "2026-07-13" }),
  ]);

  it("omits discount segment when no discount applies (ZH)", () => {
    const out = formatSummerFeeMessage(app, makeConfig(), NO_DISCOUNT, "zh");
    expect(out).toContain("費用： $1,500");
    expect(out).not.toContain("已折扣");
    expect(out).not.toContain("原價為");
  });

  it("includes discount label + amount + original price when applied (ZH)", () => {
    const out = formatSummerFeeMessage(app, makeConfig(), GROUP_DISCOUNT, "zh");
    expect(out).toContain("費用： $1,200");
    expect(out).toContain("已折扣 $300");
    expect(out).toContain("三人同行");
    expect(out).toContain("原價為 $1,500");
  });

  it("includes discount label + amount + original price when applied (EN)", () => {
    const out = formatSummerFeeMessage(app, makeConfig(), GROUP_DISCOUNT, "en");
    expect(out).toContain("Fee: $1,200");
    expect(out).toContain("Discounted $300");
    expect(out).toContain("Group of 3+");
    expect(out).toContain("original price $1,500");
  });

  it("includes student_name and localized branch name", () => {
    const zh = formatSummerFeeMessage(app, makeConfig(), NO_DISCOUNT, "zh");
    expect(zh).toContain("學生姓名：陳小明");
    expect(zh).toContain("MathConcept 中學教室 (華士古分校)");
    expect(zh).not.toContain("報名編號");

    const en = formatSummerFeeMessage(app, makeConfig(), NO_DISCOUNT, "en");
    expect(en).toContain("Student Name: 陳小明");
    expect(en).toContain("MathConcept Secondary Academy (Vasco Center)");
    expect(en).not.toContain("Reference:");
  });

  it("uses the MSA bank account number for 華士古分校", () => {
    const out = formatSummerFeeMessage(app, makeConfig(), NO_DISCOUNT, "zh");
    expect(out).toContain("185000380468369");
  });

  it("uses the MSB bank account number for 二龍喉分校", () => {
    const msbApp = makeApp([makeSession()], { preferred_location: "二龍喉分校" });
    const out = formatSummerFeeMessage(msbApp, makeConfig(), NO_DISCOUNT, "zh");
    expect(out).toContain("185000010473304");
    expect(out).toContain("(二龍喉分校)");
  });

  it("uses the linked student's school_student_id and name when linked (ZH)", () => {
    const linked = makeApp([makeSession()], {
      student_name: "Applicant Typo",
      linked_student: {
        id: 99,
        student_name: "Hayley Wong Hei Man",
        school_student_id: "1117",
      },
    });
    const out = formatSummerFeeMessage(linked, makeConfig(), NO_DISCOUNT, "zh");
    expect(out).toContain("學生編號：1117");
    expect(out).toContain("學生姓名：Hayley Wong Hei Man");
    expect(out).not.toContain("Applicant Typo");
  });

  it("uses the linked student's school_student_id and name when linked (EN)", () => {
    const linked = makeApp([makeSession()], {
      linked_student: {
        id: 99,
        student_name: "Hayley Wong Hei Man",
        school_student_id: "1117",
      },
    });
    const out = formatSummerFeeMessage(linked, makeConfig(), NO_DISCOUNT, "en");
    expect(out).toContain("Student ID: 1117");
    expect(out).toContain("Student Name: Hayley Wong Hei Man");
  });

  it("omits the student-id line and falls back to app.student_name when unlinked", () => {
    const unlinked = makeApp([makeSession()], { linked_student: null });
    const out = formatSummerFeeMessage(unlinked, makeConfig(), NO_DISCOUNT, "zh");
    expect(out).toContain("學生姓名：陳小明");
    expect(out).not.toContain("學生編號");
  });

  it("branch follows placed session location when it differs from preference", () => {
    const placedAtB = makeApp(
      [makeSession({ location: "二龍喉分校" })],
      { preferred_location: "華士古分校" },
    );
    const out = formatSummerFeeMessage(placedAtB, makeConfig(), NO_DISCOUNT, "zh");
    expect(out).toContain("(二龍喉分校)");
    expect(out).toContain("185000010473304");
    expect(out).not.toContain("185000380468369");
  });

  it("picks the most common location when sessions span two branches", () => {
    const split = makeApp([
      makeSession({ id: 1, location: "華士古分校" }),
      makeSession({ id: 2, location: "華士古分校" }),
      makeSession({ id: 3, location: "二龍喉分校" }),
    ]);
    const out = formatSummerFeeMessage(split, makeConfig(), NO_DISCOUNT, "zh");
    expect(out).toContain("(華士古分校)");
  });
});

describe("formatSummerFeeMessage — payment terms block", () => {
  const app = makeApp([makeSession({ lesson_date: "2026-07-06" })]);

  it("includes the base payment terms line (ZH)", () => {
    const out = formatSummerFeeMessage(app, makeConfig(), NO_DISCOUNT, "zh");
    expect(out).toContain("請於第一堂或之前繳交學費。");
    expect(out).toContain("$200 手續費");
  });

  it("includes the base payment terms line (EN)", () => {
    const out = formatSummerFeeMessage(app, makeConfig(), NO_DISCOUNT, "en");
    expect(out).toContain("on or before the first lesson.");
    expect(out).toContain("$200 handling fee");
  });

  it("omits tier-lock warning when applied discount has no before_date", () => {
    const out = formatSummerFeeMessage(app, makeConfig(), GROUP_DISCOUNT, "zh");
    expect(out).not.toContain("鎖定折扣");
  });

  it("appends tier-lock warning when applied discount has a before_date (ZH)", () => {
    const out = formatSummerFeeMessage(app, makeConfig(), EB_GROUP_DISCOUNT, "zh");
    expect(out).toContain("※ 三人同行早鳥優惠須於 2026/06/15 前繳費以鎖定折扣。");
  });

  it("appends tier-lock warning with English name + deadline (EN)", () => {
    const out = formatSummerFeeMessage(app, makeConfig(), EB_GROUP_DISCOUNT, "en");
    expect(out).toContain("* The Early Bird Group of 3+ discount must be paid by 2026/06/15 to lock it in.");
  });

  it("honours pricing_config overrides for payment terms and tier lock note", () => {
    const config = makeConfig({
      pricing_config: {
        base_fee: 1500,
        payment_terms_zh: "試用版：請於 {course_start} 前付款。",
        tier_lock_note_zh: "!! {tier_name} 須於 {deadline} 前付清 !!",
      },
    });
    const out = formatSummerFeeMessage(app, config, EB_GROUP_DISCOUNT, "zh");
    expect(out).toContain("試用版：請於 2026/07/05 前付款。");
    expect(out).toContain("!! 三人同行早鳥 須於 2026/06/15 前付清 !!");
  });
});

describe("formatSummerFeeMessage — partial plan", () => {
  const partialApp = (lessons: number) =>
    makeApp(
      Array.from({ length: lessons }, (_, i) =>
        makeSession({ id: i + 1, lesson_number: i + 1, lesson_date: `2026-07-${String(6 + i * 7).padStart(2, "0")}` }),
      ),
      { lessons_paid: lessons, total_lessons: 8 },
    );

  const PARTIAL_DISCOUNT: DiscountResult = {
    best: null,
    amount: 0,
    finalFee: 4 * 400,
    nearMiss: null,
  };

  it("renders flat-rate fee line with breakdown (ZH)", () => {
    const out = formatSummerFeeMessage(partialApp(4), makeConfig(), PARTIAL_DISCOUNT, "zh");
    expect(out).toContain("費用： $400 × 4 = $1,600");
    expect(out).not.toContain("已折扣");
    expect(out).not.toContain("原價為");
  });

  it("renders flat-rate fee line with breakdown (EN)", () => {
    const out = formatSummerFeeMessage(partialApp(4), makeConfig(), PARTIAL_DISCOUNT, "en");
    expect(out).toContain("Fee: $400 × 4 = $1,600");
    expect(out).not.toContain("Discounted");
    expect(out).not.toContain("original price");
  });

  it("omits tier-lock warning even when an early-bird discount was passed in", () => {
    const out = formatSummerFeeMessage(partialApp(4), makeConfig(), EB_GROUP_DISCOUNT, "zh");
    expect(out).not.toContain("鎖定折扣");
    expect(out).not.toContain("三人同行早鳥");
  });

  it("honours pricing_config.partial_per_lesson_rate override", () => {
    const config = makeConfig({
      pricing_config: { base_fee: 1500, partial_per_lesson_rate: 350 },
    });
    const app4 = partialApp(4);
    const discount: DiscountResult = { best: null, amount: 0, finalFee: 4 * 350, nearMiss: null };
    const out = formatSummerFeeMessage(app4, config, discount, "en");
    expect(out).toContain("Fee: $350 × 4 = $1,400");
  });
});
