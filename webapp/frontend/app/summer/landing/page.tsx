"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Plus, Minus } from "lucide-react";
import { summerAPI } from "@/lib/api";
import type { SummerCourseFormConfig, SummerLocation } from "@/types";
import { getActiveSummerPromo, formatDateShort } from "@/lib/summer-utils";

const LANG = "zh" as const;
const CN_NUM = ["壹", "貳", "參", "肆", "伍", "陸", "柒", "捌"];

// =============================================================================
// Reveal — fades children in when scrolled into view (one-shot)
// =============================================================================
function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={`transition-all duration-[1100ms] ease-out ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
      } ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

// =============================================================================
// Decorative bits
// =============================================================================
function Eyebrow({ en, zh }: { en: string; zh: string }) {
  return (
    <div className="inline-flex items-center gap-3 text-[11px] tracking-[0.35em] uppercase">
      <span className="h-px w-8 bg-current opacity-60" />
      <span>{en}</span>
      <span className="opacity-50">·</span>
      <span
        style={{
          fontFamily: "var(--font-serif-tc)",
          letterSpacing: "0.2em",
        }}
      >
        {zh}
      </span>
      <span className="h-px w-8 bg-current opacity-60" />
    </div>
  );
}

function GoldRule() {
  return (
    <div className="flex items-center justify-center gap-3">
      <div className="h-px w-20 bg-gradient-to-r from-transparent to-[#F5C518]/70" />
      <div className="w-1.5 h-1.5 rotate-45 bg-[#F5C518]" />
      <div className="h-px w-20 bg-gradient-to-l from-transparent to-[#F5C518]/70" />
    </div>
  );
}

function CornerOrnament({
  pos,
  color = "#F5C518",
}: {
  pos: "tl" | "tr" | "bl" | "br";
  color?: string;
}) {
  const map = {
    tl: "top-0 left-0 border-t-2 border-l-2",
    tr: "top-0 right-0 border-t-2 border-r-2",
    bl: "bottom-0 left-0 border-b-2 border-l-2",
    br: "bottom-0 right-0 border-b-2 border-r-2",
  };
  return (
    <div
      className={`absolute ${map[pos]} w-8 h-8 pointer-events-none`}
      style={{ borderColor: color }}
    />
  );
}

// Gold-on-red CTA button — used in hero and footer
function PrimaryCTA({ size = "md" }: { size?: "md" | "lg" }) {
  const padding =
    size === "lg"
      ? "px-12 py-5 sm:px-16 sm:py-6 text-lg sm:text-xl"
      : "px-10 py-4 sm:px-12 sm:py-5 text-lg sm:text-xl";
  return (
    <Link
      href="/apply"
      className={`group relative inline-flex items-center gap-3 ${padding} bg-[#F5C518] text-[#8a0a18] font-bold tracking-wider hover:bg-[#FFD23F] transition-all duration-300 shadow-[0_8px_30px_rgba(245,197,24,0.35)] hover:shadow-[0_12px_40px_rgba(245,197,24,0.55)] hover:-translate-y-0.5`}
      style={{ fontFamily: "var(--font-serif-tc)" }}
    >
      <span className="relative z-10">立 即 報 名</span>
      <ArrowRight className="h-5 w-5 relative z-10 transition-transform group-hover:translate-x-1" />
      <span className="absolute top-0 left-0 w-3 h-3 border-t border-l border-[#8a0a18]/40" />
      <span className="absolute top-0 right-0 w-3 h-3 border-t border-r border-[#8a0a18]/40" />
      <span className="absolute bottom-0 left-0 w-3 h-3 border-b border-l border-[#8a0a18]/40" />
      <span className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-[#8a0a18]/40" />
    </Link>
  );
}

// =============================================================================
// FAQ
// =============================================================================
const FAQS = [
  {
    q: "此暑期班是否需要正式報名？",
    a: "本表格主要為收集您心儀的上課時段意向，並非正式報名。提交後，我們的導師團隊將會聯絡家長，確認課堂安排及完成留位手續。",
  },
  {
    q: "適合升讀哪些年級的學生？",
    a: "本暑期中學班專為升讀中一至中三（F1–F3）的學生而設，課程內容會按年級分班，銜接來年正規課程的核心重點。",
  },
  {
    q: "課程共有幾堂？每堂多長時間？",
    a: "暑期中學班共設八堂，每堂九十分鐘，總時數十二小時，足以系統地梳理一個學期的核心概念，幫助學生在暑假中穩步打好基礎。",
  },
  {
    q: "「三人同行」優惠如何運作？",
    a: "三位學生組成同行小組，每人即可享有早鳥優惠價。您可以在報名表中建立全新的同行碼供朋友加入，或輸入朋友已建立的同行碼，加入既有小組。",
  },
  {
    q: "如需更改上課時間，該怎麼辦？",
    a: "請聯絡您所選的分校，我們會盡力協助調整。建議於遞交意向表時，預留一個後備時段選擇，方便我們安排。",
  },
  {
    q: "是否提供試堂服務？",
    a: "暑期中學班並不設個別試堂，但歡迎家長隨時聯絡分校查詢課程內容、教學風格及師資詳情，我們會詳細為您解答。",
  },
];

function FaqItem({
  q,
  a,
  index,
  open,
  onToggle,
}: {
  q: string;
  a: string;
  index: number;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-b border-[#1A1614]/15">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-start gap-5 py-6 text-left group"
        aria-expanded={open}
      >
        <span
          className="text-2xl text-[#B60D20]/60 group-hover:text-[#B60D20] transition-colors shrink-0 leading-none mt-1 tabular-nums"
          style={{ fontFamily: "var(--font-serif-tc)" }}
        >
          0{index + 1}
        </span>
        <span
          className="flex-1 text-lg sm:text-xl text-[#1A1614] group-hover:text-[#B60D20] transition-colors leading-snug"
          style={{ fontFamily: "var(--font-serif-tc)", fontWeight: 600 }}
        >
          {q}
        </span>
        <span className="shrink-0 mt-2 text-[#B60D20]">
          {open ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        </span>
      </button>
      <div
        className={`grid transition-all duration-500 ease-out ${
          open ? "grid-rows-[1fr] opacity-100 pb-6" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <p
            className="pl-12 pr-4 text-[15px] text-[#1A1614]/75 leading-[1.9]"
            style={{ fontFamily: "var(--font-sans-tc)" }}
          >
            {a}
          </p>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Page
// =============================================================================
export default function SummerLandingPage() {
  const [config, setConfig] = useState<SummerCourseFormConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  useEffect(() => {
    summerAPI
      .getFormConfig()
      .then(setConfig)
      .catch(() => setError("載入失敗，請稍後再試。"));
  }, []);

  if (error) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-[#1A1614]">
        <p style={{ fontFamily: "var(--font-serif-tc)" }} className="text-lg">
          {error}
        </p>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="h-10 w-10 rounded-full border-2 border-[#B60D20]/20 border-t-[#B60D20] animate-spin" />
      </div>
    );
  }

  const promo = getActiveSummerPromo(config.pricing_config, LANG);
  const intro = config.course_intro;
  const pillars = intro?.pillars ?? [];
  const philosophy = intro?.philosophy?.zh ?? "";

  const gradeNames = config.available_grades.map((g) => g.name);
  const gradeRange = gradeNames.length
    ? `${gradeNames[0]} – ${gradeNames[gradeNames.length - 1]}`
    : "升 F1 – F3";

  const dateRange = `${formatDateShort(
    config.course_start_date,
    LANG
  )} – ${formatDateShort(config.course_end_date, LANG)}`;

  const totalHours = (config.total_lessons * 1.5).toFixed(0);

  return (
    // Escape SummerLayoutInner padding so we can do full-bleed bands
    <div
      className="-mx-4 sm:-mx-8 -my-8 text-[#1A1614]"
      style={{ fontFamily: "var(--font-sans-tc), system-ui, sans-serif" }}
    >
      {/* ===================================================================
          HERO — slogan as poster centerpiece
          =================================================================== */}
      <section className="relative bg-[#A40C1D] text-white overflow-hidden">
        {/* Vignette + grid texture for paper-poster feel */}
        <div
          className="absolute inset-0 opacity-[0.08] pointer-events-none mix-blend-overlay"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 0%, white, transparent 50%), radial-gradient(circle at 80% 100%, white, transparent 50%)",
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.04] pointer-events-none"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, white 0, white 1px, transparent 1px, transparent 24px), repeating-linear-gradient(90deg, white 0, white 1px, transparent 1px, transparent 24px)",
          }}
        />

        <div className="relative max-w-6xl mx-auto px-6 pt-12 pb-16 sm:pt-16 sm:pb-24 md:pt-20 md:pb-28">
          <Reveal>
            <div className="flex justify-center mb-10 sm:mb-14 text-[#F5C518]">
              <Eyebrow en={`MATHCONCEPT · CLASS OF ${config.year}`} zh="現正招生" />
            </div>
          </Reveal>

          {/* Slogan centerpiece */}
          <Reveal delay={150}>
            <div className="relative mx-auto max-w-4xl">
              <div className="absolute -top-3 inset-x-12 h-px bg-gradient-to-r from-transparent via-[#F5C518]/70 to-transparent" />
              <div className="relative h-28 sm:h-36 md:h-44 lg:h-52 overflow-hidden">
                <Image
                  src="/summer/summer-slogan-wide.jpg"
                  alt="暑假12個鐘，來年數學好輕鬆"
                  width={4995}
                  height={555}
                  className="w-full h-full object-cover object-center"
                  priority
                />
              </div>
              <div className="absolute -bottom-3 inset-x-12 h-px bg-gradient-to-r from-transparent via-[#F5C518]/70 to-transparent" />
            </div>
          </Reveal>

          <Reveal delay={350}>
            <div className="mt-12 sm:mt-16 text-center space-y-3">
              <p
                className="text-xl sm:text-2xl text-white/95 leading-relaxed"
                style={{ fontFamily: "var(--font-serif-tc)", fontWeight: 500 }}
              >
                為 {gradeRange} 學生而設 · {config.total_lessons} 堂 · 共 {totalHours} 小時
              </p>
              <p
                className="text-sm sm:text-base text-[#F5C518] tracking-[0.2em]"
                style={{ fontFamily: "var(--font-serif-tc)" }}
              >
                {dateRange}
              </p>
            </div>
          </Reveal>

          <Reveal delay={550}>
            <div className="mt-12 sm:mt-14 flex flex-col items-center gap-4">
              <PrimaryCTA size="md" />
              <p className="text-xs text-white/60 tracking-widest">
                免費登記 · 無須付費
              </p>
            </div>
          </Reveal>
        </div>

        <div className="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-transparent via-[#F5C518]/80 to-transparent" />
      </section>

      {/* ===================================================================
          ABOUT — pillars + philosophy
          =================================================================== */}
      <section className="relative bg-[#FBF7F0] py-20 sm:py-28">
        <div
          className="absolute inset-0 opacity-[0.04] pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(#1A1614 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />

        <div className="relative max-w-5xl mx-auto px-6">
          <Reveal>
            <div className="text-center text-[#B60D20]">
              <Eyebrow en="OUR APPROACH" zh="教學理念" />
            </div>
          </Reveal>

          <Reveal delay={150}>
            <h2
              className="mt-8 text-center text-3xl sm:text-4xl md:text-5xl leading-[1.4] text-[#1A1614]"
              style={{ fontFamily: "var(--font-serif-tc)", fontWeight: 700 }}
            >
              理解比死記更重要
              <br />
              <span className="text-[#B60D20]">思維比計算更關鍵</span>
            </h2>
          </Reveal>

          {pillars.length > 0 && (
            <div className="mt-16 sm:mt-20 grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
              {pillars.slice(0, 4).map((p, i) => (
                <Reveal key={i} delay={200 + i * 120}>
                  <div className="relative bg-white border border-[#1A1614]/8 p-7 sm:p-8 group hover:border-[#B60D20]/40 transition-colors duration-500">
                    <div className="flex items-start gap-5">
                      <div className="shrink-0">
                        <span
                          className="block text-4xl sm:text-5xl text-[#F5C518] leading-none"
                          style={{
                            fontFamily: "var(--font-serif-tc)",
                            fontWeight: 700,
                          }}
                        >
                          {CN_NUM[i]}
                        </span>
                        <div className="mt-2 h-px w-8 bg-[#B60D20]/30 group-hover:bg-[#B60D20] transition-colors" />
                      </div>
                      <p
                        className="text-lg sm:text-xl text-[#1A1614] leading-snug pt-1"
                        style={{
                          fontFamily: "var(--font-serif-tc)",
                          fontWeight: 600,
                        }}
                      >
                        {p.zh}
                      </p>
                    </div>
                    <span className="absolute top-3 right-3 w-2 h-2 border-t border-r border-[#B60D20]/30" />
                  </div>
                </Reveal>
              ))}
            </div>
          )}

          {philosophy && (
            <Reveal delay={700}>
              <div className="mt-20 sm:mt-24 max-w-3xl mx-auto text-center relative">
                <span
                  className="absolute -top-8 left-1/2 -translate-x-1/2 text-7xl text-[#B60D20]/15 leading-none select-none"
                  style={{ fontFamily: "var(--font-serif-tc)" }}
                >
                  「
                </span>
                <p
                  className="relative text-lg sm:text-xl text-[#1A1614]/85 leading-[2]"
                  style={{
                    fontFamily: "var(--font-serif-tc)",
                    textWrap: "balance",
                  }}
                >
                  {philosophy}
                </p>
                <div className="mt-10">
                  <GoldRule />
                </div>
              </div>
            </Reveal>
          )}
        </div>
      </section>

      {/* ===================================================================
          SAMPLE WORKSHEET (placeholder)
          =================================================================== */}
      <section className="relative bg-[#FBF7F0] pb-20 sm:pb-28">
        <div className="max-w-4xl mx-auto px-6">
          <Reveal>
            <div className="text-center text-[#B60D20]">
              <Eyebrow en="MATERIALS" zh="課堂教材實例" />
            </div>
          </Reveal>

          <Reveal delay={150}>
            <div className="mt-12 relative mx-auto max-w-2xl">
              <div className="relative bg-white border border-[#F5C518]/40 p-3">
                <div className="relative aspect-[4/3] bg-gradient-to-br from-[#FBF7F0] via-white to-[#FBF7F0] flex items-center justify-center overflow-hidden">
                  <div
                    className="absolute inset-0 opacity-[0.06]"
                    style={{
                      backgroundImage:
                        "repeating-linear-gradient(45deg, #1A1614 0, #1A1614 1px, transparent 1px, transparent 14px)",
                    }}
                  />
                  <div className="relative text-center space-y-2">
                    <p
                      className="text-2xl sm:text-3xl text-[#1A1614]/30"
                      style={{
                        fontFamily: "var(--font-serif-tc)",
                        fontWeight: 600,
                      }}
                    >
                      教 材 樣 本
                    </p>
                    <p className="text-xs tracking-[0.3em] text-[#1A1614]/40 uppercase">
                      Sample Material · Coming Soon
                    </p>
                  </div>
                  <CornerOrnament pos="tl" />
                  <CornerOrnament pos="tr" />
                  <CornerOrnament pos="bl" />
                  <CornerOrnament pos="br" />
                </div>
              </div>
              <p
                className="mt-5 text-center text-sm text-[#1A1614]/55 italic"
                style={{ fontFamily: "var(--font-serif-tc)" }}
              >
                由 MathConcept 教研團隊精心編製
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ===================================================================
          COURSE FACTS + EARLY BIRD PROMO
          =================================================================== */}
      <section className="relative bg-[#B60D20] text-white py-20 sm:py-28 overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.05] pointer-events-none"
          style={{
            backgroundImage:
              "repeating-linear-gradient(135deg, white 0, white 1px, transparent 1px, transparent 18px)",
          }}
        />
        <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-[#F5C518]/80 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-transparent via-[#F5C518]/80 to-transparent" />

        <div className="relative max-w-6xl mx-auto px-6">
          <Reveal>
            <div className="text-center text-[#F5C518]">
              <Eyebrow en="COURSE DETAILS" zh="課程資料" />
            </div>
          </Reveal>

          <Reveal delay={150}>
            <div className="mt-14 grid grid-cols-2 md:grid-cols-4 gap-y-12 md:gap-y-0 md:divide-x md:divide-white/15">
              {[
                { en: "Grades", zh: "對象", value: gradeRange },
                { en: "Dates", zh: "日期", value: dateRange },
                {
                  en: "Lessons",
                  zh: "課堂",
                  value: `${config.total_lessons} 堂 · 90 分鐘`,
                },
                {
                  en: "Original",
                  zh: "原價",
                  value: `$${config.pricing_config.base_fee.toLocaleString()}`,
                },
              ].map((f, i) => (
                <div key={i} className="text-center md:px-4">
                  <div className="text-[10px] tracking-[0.4em] text-[#F5C518] uppercase mb-2">
                    {f.en}
                  </div>
                  <div
                    className="text-xs tracking-[0.3em] text-white/60 mb-3"
                    style={{ fontFamily: "var(--font-serif-tc)" }}
                  >
                    {f.zh}
                  </div>
                  <div
                    className="text-xl sm:text-2xl text-white"
                    style={{
                      fontFamily: "var(--font-serif-tc)",
                      fontWeight: 600,
                    }}
                  >
                    {f.value}
                  </div>
                </div>
              ))}
            </div>
          </Reveal>

          {promo.groupFee !== null && (
            <Reveal delay={350}>
              <div className="mt-16 sm:mt-20 max-w-3xl mx-auto">
                <div className="relative bg-[#FBF7F0] text-[#1A1614] p-8 sm:p-12">
                  <CornerOrnament pos="tl" color="#B60D20" />
                  <CornerOrnament pos="tr" color="#B60D20" />
                  <CornerOrnament pos="bl" color="#B60D20" />
                  <CornerOrnament pos="br" color="#B60D20" />

                  <div className="text-center">
                    <div
                      className="inline-flex items-center gap-2 px-4 py-1.5 bg-[#B60D20] text-[#F5C518] text-xs tracking-[0.3em] uppercase"
                      style={{ fontFamily: "var(--font-serif-tc)" }}
                    >
                      早 鳥 優 惠 · Early Bird
                    </div>
                    {promo.ebActive && promo.daysUntilEb !== null && (
                      <p
                        className="mt-5 text-sm text-[#B60D20]"
                        style={{ fontFamily: "var(--font-serif-tc)" }}
                      >
                        倒數{" "}
                        <span className="text-2xl font-bold tabular-nums">
                          {promo.daysUntilEb}
                        </span>{" "}
                        日 · 截止 {promo.ebDateFormatted}
                      </p>
                    )}

                    <div className="mt-8">
                      <p
                        className="text-xs tracking-[0.4em] text-[#1A1614]/60 uppercase mb-3"
                        style={{ fontFamily: "var(--font-serif-tc)" }}
                      >
                        三 人 同 行
                      </p>
                      <div className="flex items-baseline justify-center gap-3">
                        <span
                          className="text-6xl sm:text-7xl text-[#B60D20] tabular-nums leading-none"
                          style={{
                            fontFamily: "var(--font-serif-tc)",
                            fontWeight: 800,
                          }}
                        >
                          ${promo.groupFee?.toLocaleString()}
                        </span>
                        <div className="text-left">
                          <div className="text-xs text-[#1A1614]/60 line-through tabular-nums">
                            ${config.pricing_config.base_fee.toLocaleString()}
                          </div>
                          <div className="text-xs text-[#B60D20] font-semibold mt-0.5">
                            每人 / per person
                          </div>
                        </div>
                      </div>
                      {promo.groupSavings !== null && (
                        <div className="mt-4 inline-block px-3 py-1 bg-[#F5C518] text-[#8a0a18] text-xs font-bold tracking-wider">
                          省 ${promo.groupSavings} · SAVE ${promo.groupSavings}
                        </div>
                      )}
                    </div>

                    {promo.soloFee !== null && (
                      <>
                        <div className="my-7 flex items-center justify-center gap-3">
                          <div className="h-px w-12 bg-[#1A1614]/15" />
                          <span className="text-[10px] tracking-[0.3em] text-[#1A1614]/40">
                            OR
                          </span>
                          <div className="h-px w-12 bg-[#1A1614]/15" />
                        </div>
                        <p
                          className="text-xs tracking-[0.4em] text-[#1A1614]/60 uppercase mb-2"
                          style={{ fontFamily: "var(--font-serif-tc)" }}
                        >
                          單 人 報 讀
                        </p>
                        <div className="flex items-baseline justify-center gap-2">
                          <span
                            className="text-3xl text-[#1A1614] tabular-nums"
                            style={{
                              fontFamily: "var(--font-serif-tc)",
                              fontWeight: 700,
                            }}
                          >
                            ${promo.soloFee.toLocaleString()}
                          </span>
                          {promo.soloSavings !== null && (
                            <span className="text-xs text-[#B60D20] font-semibold">
                              （省 ${promo.soloSavings}）
                            </span>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </Reveal>
          )}
        </div>
      </section>

      {/* ===================================================================
          BRANCHES
          =================================================================== */}
      <section className="relative bg-[#FBF7F0] py-20 sm:py-28">
        <div className="max-w-5xl mx-auto px-6">
          <Reveal>
            <div className="text-center text-[#B60D20]">
              <Eyebrow en="BRANCHES" zh="上課地點" />
            </div>
          </Reveal>

          <Reveal delay={150}>
            <h2
              className="mt-8 text-center text-3xl sm:text-4xl text-[#1A1614]"
              style={{ fontFamily: "var(--font-serif-tc)", fontWeight: 700 }}
            >
              就近選擇您的分校
            </h2>
          </Reveal>

          <div className="mt-16 space-y-1">
            {config.locations.map((loc: SummerLocation, i) => (
              <Reveal key={loc.name} delay={200 + i * 100}>
                <div className="group flex items-start gap-6 sm:gap-10 py-8 border-b border-[#1A1614]/12 hover:bg-white/50 transition-colors px-2 sm:px-4">
                  <span
                    className="text-4xl sm:text-5xl text-[#F5C518] leading-none shrink-0 group-hover:text-[#B60D20] transition-colors duration-500"
                    style={{
                      fontFamily: "var(--font-serif-tc)",
                      fontWeight: 700,
                    }}
                  >
                    {CN_NUM[i]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <h3
                      className="text-xl sm:text-2xl text-[#1A1614] leading-snug"
                      style={{
                        fontFamily: "var(--font-serif-tc)",
                        fontWeight: 700,
                      }}
                    >
                      {loc.name}
                    </h3>
                    {loc.name_en && (
                      <p className="text-[11px] tracking-[0.3em] text-[#B60D20]/70 uppercase mt-1">
                        {loc.name_en}
                      </p>
                    )}
                    <p
                      className="mt-3 text-sm sm:text-base text-[#1A1614]/70 leading-relaxed"
                      style={{ fontFamily: "var(--font-serif-tc)" }}
                    >
                      {loc.address}
                    </p>
                  </div>
                  {loc.open_days && loc.open_days.length > 0 && (
                    <div className="hidden sm:block text-right shrink-0">
                      <p className="text-[10px] tracking-[0.3em] text-[#1A1614]/40 uppercase mb-1">
                        Open
                      </p>
                      <p
                        className="text-sm text-[#1A1614]/70"
                        style={{ fontFamily: "var(--font-serif-tc)" }}
                      >
                        {loc.open_days.join(" · ")}
                      </p>
                    </div>
                  )}
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===================================================================
          FAQ
          =================================================================== */}
      <section className="relative bg-[#FBF7F0] pb-20 sm:pb-28">
        <div className="max-w-3xl mx-auto px-6">
          <Reveal>
            <div className="text-center text-[#B60D20]">
              <Eyebrow en="QUESTIONS" zh="常見問題" />
            </div>
          </Reveal>

          <Reveal delay={150}>
            <h2
              className="mt-8 text-center text-3xl sm:text-4xl text-[#1A1614]"
              style={{ fontFamily: "var(--font-serif-tc)", fontWeight: 700 }}
            >
              家長最關心的事
            </h2>
          </Reveal>

          <Reveal delay={250}>
            <div className="mt-14 border-t border-[#1A1614]/15">
              {FAQS.map((f, i) => (
                <FaqItem
                  key={i}
                  q={f.q}
                  a={f.a}
                  index={i}
                  open={openFaq === i}
                  onToggle={() => setOpenFaq(openFaq === i ? null : i)}
                />
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ===================================================================
          FOOTER CTA
          =================================================================== */}
      <section className="relative bg-[#A40C1D] text-white py-24 sm:py-32 overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-[#F5C518]/80 to-transparent" />
        <div
          className="absolute inset-0 opacity-[0.05] pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 50% 50%, white, transparent 60%)",
          }}
        />

        <div className="relative max-w-3xl mx-auto px-6 text-center">
          <Reveal>
            <div className="text-[#F5C518]">
              <Eyebrow en="JOIN US" zh="夏日已至" />
            </div>
          </Reveal>

          <Reveal delay={150}>
            <h2
              className="mt-10 text-3xl sm:text-4xl md:text-5xl leading-[1.5] text-white"
              style={{ fontFamily: "var(--font-serif-tc)", fontWeight: 700 }}
            >
              與我們一起
              <br />
              <span className="text-[#F5C518]">迎接更輕鬆的數學新學年</span>
            </h2>
          </Reveal>

          <Reveal delay={300}>
            <div className="mt-14 flex flex-col items-center gap-4">
              <PrimaryCTA size="lg" />
              <p className="text-xs text-white/60 tracking-widest">
                免費登記 · 無須付費 · 名額有限
              </p>
            </div>
          </Reveal>

          <Reveal delay={500}>
            <div className="mt-16">
              <GoldRule />
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
