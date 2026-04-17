"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Plus, Minus, Phone, Copy, Check, X } from "lucide-react";
import { WeChatIcon } from "@/components/parent-contacts/contact-utils";
import { summerAPI } from "@/lib/api";
import type { SummerCourseFormConfig, SummerLocation } from "@/types";
import {
  getActiveSummerPromo,
  formatDateShort,
  WEEK_DAY_ORDER,
  DAY_SHORT_ZH,
  BRANCH_IMAGES_FALLBACK,
} from "@/lib/summer-utils";

const LANG = "zh" as const;

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
  // Users with prefers-reduced-motion start visible — no fade, no slide.
  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const [visible, setVisible] = useState(reducedMotion);
  useEffect(() => {
    if (reducedMotion) return;
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
  }, [reducedMotion]);
  return (
    <div
      ref={ref}
      // summer-reveal class lets globals.css force-show on print.
      className={`summer-reveal transition-all duration-[600ms] ease-out ${
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
function Eyebrow({ zh, en }: { zh: string; en?: string }) {
  // Marketing copy is Chinese-only; the optional `en` is kept for the hero
  // brand line where a Latin accent reads as deliberate. Body sections render
  // Chinese only for consistency with the pamphlet voice.
  return (
    <div className="inline-flex items-center gap-3 text-[11px] tracking-[0.35em] uppercase">
      <span className="h-px w-8 bg-current opacity-60" />
      {en && (
        <>
          <span>{en}</span>
          <span className="opacity-50">·</span>
        </>
      )}
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
      href="/summer/apply"
      className={`group relative inline-flex items-center gap-3 ${padding} bg-[#F5C518] text-[#8a0a18] font-bold tracking-wider hover:bg-[#FFD23F] transition-all duration-300 shadow-[0_8px_30px_rgba(245,197,24,0.35)] hover:shadow-[0_12px_40px_rgba(245,197,24,0.55)] hover:-translate-y-0.5`}
      style={{ fontFamily: "var(--font-serif-tc)" }}
    >
      <span className="relative z-10">立 即 留 位</span>
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
const FAQS: Array<{ q: string; a: string; qEn?: string; aEn?: string }> = [
  {
    q: "此暑期班是否需要正式報名？",
    a: "本表格主要為收集您心儀的上課時段意向，並非正式報名。提交後，我們的導師團隊將會聯絡家長，確認課堂安排及完成留位手續。",
  },
  {
    q: "適合升讀哪些年級的學生？",
    a: "本暑期中學班專為升讀中一至中三（F1–F3）的學生而設，課程內容會按年級分班，銜接來年正規課程的核心重點。",
  },
  {
    q: "此課程是否適合英文部或國際學校學生？",
    qEn: "Is this course suitable for English-medium and international school students?",
    a: "絕對適合。本暑期班以數學概念為核心，課程適合中文部、英文部及國際學校學生。導師會因應學生的語言背景調整用語以作講解。歡迎英文部或國際學校家長直接聯絡分校了解更多課程內容。",
    aEn: "Absolutely. The class focuses on underlying maths concepts, so it works equally well for students from Chinese-medium, English-medium, and international schools. Tutors adapt vocabulary and explanations to each student's comfort. English-speaking families are welcome to contact any branch directly for more details.",
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
    a: "請聯絡您所選的分校，我們會盡力協助調整。建議填寫意向表時，填上未能上課的日子，以及第二志願時段，以便安排最合適的班別。",
  },
  {
    q: "是否提供試堂服務？",
    a: "暑期中學班不設試堂，但歡迎家長隨時聯絡分校查詢課程安排，我們會詳細為您解答。",
  },
];

// =============================================================================
// 家長須知 — verbatim from marketing copy
// =============================================================================
const GENERAL_RULES = [
  "學生需按照收據上之上課日期，於每星期之固定時間出席課堂。",
  "家長應讓導師有系統地執行孩子的學習計劃，請勿隨便缺席或調堂。",
  "學生務必準時上課，遲到恕不補時。",
  "除因病缺席外，凡因個人理由缺席者，必須最少在上課前1天的辦公時間內申請，無故缺席者，課堂會被自動扣除，恕不補堂。病假必須出示病假紙，方可作補課安排。",
  "任何課堂調動或補堂上限，請查閱相應課程條款。逾期未上之課堂，將視作自願放棄論。",
  "本校有權因應實際情況，接納或拒絕任何請假及補堂申請。",
  "因惡劣天氣或不可抗力因素而暫停之課堂，將以補堂形式完成。",
  "本校接受現金或指定戶口轉帳，繳費後需發收條至本校確認。",
  "所有已繳續費恕不退還。",
];

// Per-branch contact info — matched by Chinese name substring (admin can
// rename name_en freely without breaking the lookup). Not in the config
// schema yet; if more branches arrive, promote to a config field.
type BranchContact = { phone: string; wechat: string };
function getBranchContact(loc: SummerLocation): BranchContact | null {
  if (loc.name.includes("華士古")) return { phone: "2835 3333", wechat: "MathConcept9" };
  if (loc.name.includes("二龍喉")) return { phone: "6890 5098", wechat: "MathConcept10" };
  return null;
}

// Canonical Google Maps place URLs — address-search can mispin on Macau
// addresses, so we prefer the `maps.app.goo.gl` short links that point at
// the exact place. Falls back to address search for unknown branches.
function getBranchMapsUrl(loc: SummerLocation): string {
  if (loc.name.includes("華士古")) return "https://maps.app.goo.gl/ho4fRdwPqTdsETXV8";
  if (loc.name.includes("二龍喉")) return "https://maps.app.goo.gl/qUKkmfWkWZwiB3c99";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc.address)}`;
}

const SUMMER_RULES = [
  "調堂每期（8堂/期）上限2堂。",
  "課堂有效期為學費期內，所有補堂須於報名年度8月內完成，已安排之補堂不得再次更改。",
];

// First-page JPGs of representative MathConcept worksheets, one per grade.
// Full materials are intentionally not exposed; see no-image-save protection
// at the route root and the public/summer/samples/ folder for source.
const SAMPLE_WORKSHEETS = [
  {
    src: "/summer/samples/sample-f1-rationals.jpg",
    grade: "F1",
    topic: "有理數",
    caption: "從負數直覺起步，再建立運算規則",
    badge: "圖像化概念",
  },
  {
    src: "/summer/samples/sample-f2-pythagoras.jpg",
    grade: "F2",
    topic: "勾股定理",
    caption: "多種方法推演，再歸納為定理",
    badge: "多路徑推演",
  },
  {
    src: "/summer/samples/sample-f3-quadratics.jpg",
    grade: "F3",
    topic: "二次函數",
    caption: "亦設英文版教材，適合英文部學生",
    badge: "英文版教材",
  },
] as const;

function FaqItem({
  q,
  a,
  qEn,
  aEn,
  index,
  open,
  onToggle,
}: {
  q: string;
  a: string;
  qEn?: string;
  aEn?: string;
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
        <span className="flex-1">
          <span
            className="block text-lg sm:text-xl text-[#1A1614] group-hover:text-[#B60D20] transition-colors leading-snug"
            style={{ fontFamily: "var(--font-serif-tc)", fontWeight: 600 }}
          >
            {q}
          </span>
          {qEn && (
            <span className="block mt-1.5 text-sm text-[#1A1614]/55 italic leading-snug">
              {qEn}
            </span>
          )}
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
          {aEn && (
            <p className="pl-12 pr-4 mt-4 text-sm text-[#1A1614]/55 italic leading-[1.8]">
              {aEn}
            </p>
          )}
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
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [copiedWechat, setCopiedWechat] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  // ESC to close lightbox + lock body scroll while open.
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [lightbox]);

  const copyWechat = (id: string) => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    navigator.clipboard.writeText(id).then(() => {
      setCopiedWechat(id);
      window.setTimeout(() => {
        setCopiedWechat((curr) => (curr === id ? null : curr));
      }, 1800);
    });
  };

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
  const philosophyEn = intro?.philosophy?.en ?? "";

  const gradeNames = config.available_grades.map((g) => g.name);
  const gradeRange = gradeNames.length
    ? `升${gradeNames[0]} 至 升${gradeNames[gradeNames.length - 1]}`
    : "升中一 至 升中三";

  const dateRange = `${formatDateShort(
    config.course_start_date,
    LANG
  )} – ${formatDateShort(config.course_end_date, LANG)}`;

  const langStreams = config.lang_stream_options?.length
    ? config.lang_stream_options.map((o) => o.name).join("／")
    : undefined;

  return (
    // Escape SummerLayoutInner padding so we can do full-bleed bands.
    // no-image-save: blocks the casual right-click "Save image as…" path on
    // every <img> in this subtree. CSS rule lives in app/globals.css; the
    // onContextMenu handler is the JS belt-and-braces.
    <div
      className="no-image-save -mx-4 sm:-mx-8 -my-8 text-[#1A1614]"
      style={{ fontFamily: "var(--font-sans-tc), system-ui, sans-serif" }}
      onContextMenu={(e) => {
        if (e.target instanceof HTMLImageElement) e.preventDefault();
      }}
    >
      {/* ===================================================================
          HERO — slogan as poster centerpiece
          =================================================================== */}
      <section className="relative bg-[#B60D20] text-white overflow-hidden">

        <div className="relative max-w-6xl mx-auto px-6 pt-12 pb-16 sm:pt-16 sm:pb-24 md:pt-20 md:pb-28">
          <Reveal>
            <div className="flex justify-center mb-10 sm:mb-14 text-[#F5C518]">
              <Eyebrow zh={`${config.year} 暑期課程 · 現正招生`} />
            </div>
          </Reveal>

          {/* Slogan centerpiece */}
          <Reveal delay={150}>
            <div className="relative mx-auto max-w-4xl">
              <div className="absolute -top-3 inset-x-12 h-px bg-gradient-to-r from-transparent via-[#F5C518]/70 to-transparent" />
              {/* Aspect-ratio container scales with width, so the slogan
                  fills naturally on every viewport. Uses the narrower
                  4.45:1 source so mobile gets a meaningful height instead
                  of a 9:1 letterbox. */}
              <div className="relative w-full aspect-[4.45/1] overflow-hidden">
                <Image
                  src="/summer/summer-slogan.jpg"
                  alt="暑假12個鐘，來年數學好輕鬆"
                  width={2473}
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
                為 {gradeRange} 學生而設
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
              <PrimaryCTA size="lg" />
              {promo.ebActive && promo.ebDateFormatted && (
                <p className="text-xs text-white/70 tracking-widest">
                  早鳥優惠｜{promo.ebDateFormatted}前報名 · 三人同行優惠高達 $4,200
                </p>
              )}
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
              <Eyebrow zh="教學理念" />
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
            <div className="mt-6 mx-auto h-px w-12 bg-[#1A1614]/15" />
            <p
              className="mt-6 text-center text-sm sm:text-base text-[#1A1614]/55 italic leading-[1.9]"
              style={{ textWrap: "balance" }}
            >
              Understanding over memorisation.
              <br />
              Thinking over calculation.
            </p>
          </Reveal>

          {pillars.length > 0 && (
            <div
              className={`mt-16 sm:mt-20 grid grid-cols-1 gap-6 sm:gap-8 ${
                pillars.length > 1 ? "sm:grid-cols-2" : "max-w-xl mx-auto"
              }`}
            >
              {pillars.map((p, i) => (
                <Reveal key={i} delay={200 + i * 120}>
                  <div className="relative bg-white border border-[#1A1614]/8 p-7 sm:p-8">
                    <div className="flex items-start gap-5">
                      <div className="shrink-0">
                        <span
                          className="block text-2xl sm:text-3xl text-[#F5C518] leading-none tabular-nums"
                          style={{
                            fontFamily: "var(--font-serif-tc)",
                            fontWeight: 700,
                          }}
                        >
                          0{i + 1}
                        </span>
                        <div className="mt-2 h-px w-6 bg-[#B60D20]/30" />
                      </div>
                      <div className="pt-1">
                        <p
                          className="text-lg sm:text-xl text-[#1A1614] leading-snug"
                          style={{
                            fontFamily: "var(--font-serif-tc)",
                            fontWeight: 600,
                          }}
                        >
                          {p.zh}
                        </p>
                        {p.en && (
                          <p className="mt-2 text-xs sm:text-sm text-[#1A1614]/50 italic leading-snug">
                            {p.en}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          )}

          {philosophy && (
            <Reveal delay={700}>
              <div className="mt-20 sm:mt-24 max-w-3xl mx-auto text-center relative">
                <p
                  className="relative text-lg sm:text-xl text-[#1A1614]/85 leading-[2]"
                  style={{
                    fontFamily: "var(--font-serif-tc)",
                    textWrap: "balance",
                  }}
                >
                  {philosophy}
                </p>
                {philosophyEn && (
                  <>
                    <div className="mt-8 mx-auto h-px w-12 bg-[#1A1614]/15" />
                    <p
                      className="mt-8 text-sm sm:text-base text-[#1A1614]/55 italic leading-[1.9] max-w-2xl mx-auto"
                      style={{ textWrap: "balance" }}
                    >
                      {philosophyEn}
                    </p>
                    <p
                      className="mt-5 text-xs sm:text-sm text-[#1A1614]/45 italic leading-[1.8] max-w-2xl mx-auto"
                      style={{ textWrap: "balance" }}
                    >
                      We also teach students from English-medium and international schools. For details in English, please{" "}
                      <a
                        href="#branches"
                        className="underline decoration-[#1A1614]/25 underline-offset-4 hover:text-[#B60D20] hover:decoration-[#B60D20]/40 transition-colors"
                      >
                        contact any of our branches
                      </a>
                      .
                    </p>
                  </>
                )}
                <div className="mt-10">
                  <GoldRule />
                </div>
              </div>
            </Reveal>
          )}
        </div>
      </section>

      {/* ===================================================================
          SAMPLE WORKSHEETS — first page only, intentionally tease-only.
          Full materials are not exposed; right-click save is blocked at
          the route root via no-image-save class.
          =================================================================== */}
      <section className="relative bg-[#FBF7F0] pb-20 sm:pb-28">
        <div className="max-w-5xl mx-auto px-6">
          <Reveal>
            <div className="text-center text-[#B60D20]">
              <Eyebrow zh="課堂教材實例" />
            </div>
          </Reveal>

          <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-8 sm:gap-10">
            {SAMPLE_WORKSHEETS.map(({ src, grade, topic, caption, badge }, i) => (
              <Reveal key={src} delay={150 + i * 120}>
                <div>
                  {/* Grade + topic label above — tells parents at a glance
                      what each sheet teaches before they click in. */}
                  <div className="mb-4 flex items-baseline gap-3">
                    <span
                      className="text-xl sm:text-2xl text-[#F5C518] leading-none tabular-nums"
                      style={{ fontFamily: "var(--font-serif-tc)", fontWeight: 700 }}
                    >
                      {grade}
                    </span>
                    <span className="h-px flex-1 bg-[#1A1614]/15" />
                    <span
                      className="text-sm sm:text-base text-[#1A1614]/75 leading-none"
                      style={{ fontFamily: "var(--font-serif-tc)", fontWeight: 600 }}
                    >
                      {topic}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setLightbox(src)}
                    className="group relative block w-full text-left cursor-zoom-in"
                    aria-label={`放大檢視 ${grade} ${topic} 課堂教材樣本`}
                  >
                    {/* Page peek — suggests this is page 1 of a larger packet. */}
                    <div
                      aria-hidden
                      className="absolute inset-0 translate-x-2 translate-y-2 bg-white border border-[#F5C518]/25 shadow-sm"
                    />
                    <div className="relative bg-white border border-[#F5C518]/40 p-2 shadow-sm transition-all duration-300 ease-out group-hover:-translate-y-1 group-hover:shadow-lg">
                      <div className="relative aspect-[1191/1684] overflow-hidden bg-[#FBF7F0]">
                        <Image
                          src={src}
                          alt={`${grade} ${topic} 課堂教材樣本`}
                          fill
                          sizes="(min-width: 640px) 33vw, 100vw"
                          className="object-cover select-none pointer-events-none"
                          draggable={false}
                        />
                      </div>
                      <CornerOrnament pos="tl" />
                      <CornerOrnament pos="tr" />
                      <CornerOrnament pos="bl" />
                      <CornerOrnament pos="br" />
                    </div>
                    {/* "重點" bookmark that slides in on hover/focus. Readable
                        to screen readers always (info isn't purely decorative). */}
                    <div
                      className="absolute -top-3 right-6 z-10 px-3 py-1.5 bg-[#F5C518] text-[#8a0a18] text-[11px] tracking-[0.2em] shadow-md opacity-0 translate-y-1 transition-all duration-300 group-hover:opacity-100 group-hover:translate-y-0 group-focus:opacity-100 group-focus:translate-y-0"
                      style={{ fontFamily: "var(--font-serif-tc)", fontWeight: 700 }}
                    >
                      重點 · {badge}
                    </div>
                  </button>

                  <p
                    className="mt-5 text-sm text-[#1A1614]/60 italic leading-relaxed"
                    style={{ fontFamily: "var(--font-serif-tc)", textWrap: "balance" }}
                  >
                    {caption}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
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
              <Eyebrow zh="課程資料" />
            </div>
          </Reveal>

          <Reveal delay={150}>
            <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-y-12 md:gap-y-0 md:divide-x md:divide-white/15">
              {[
                { zh: "對象", value: gradeRange, sub: langStreams },
                { zh: "日期", value: dateRange },
                { zh: "課堂", value: `${config.total_lessons} 堂 · 90 分鐘` },
              ].map((f, i) => (
                <div key={i} className="text-center md:px-4">
                  <div
                    className="text-xs tracking-[0.4em] text-[#F5C518] mb-3"
                    style={{ fontFamily: "var(--font-serif-tc)" }}
                  >
                    {f.zh}
                  </div>
                  <div
                    className="text-xl sm:text-2xl text-white whitespace-nowrap"
                    style={{
                      fontFamily: "var(--font-serif-tc)",
                      fontWeight: 600,
                    }}
                  >
                    {f.value}
                  </div>
                  {f.sub && (
                    <div
                      className="mt-2 text-xs text-white/60 tracking-wider"
                      style={{ fontFamily: "var(--font-serif-tc)" }}
                    >
                      {f.sub}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Reveal>

          {/* Early-bird urgency hook only — the full price breakdown lives
              in the brand-designed poster section below, so a JSX promo card
              here would just duplicate it. Keep the countdown so the time
              pressure is visible at-a-glance. */}
          {promo.ebActive && promo.daysUntilEb !== null && (
            <Reveal delay={350}>
              <div className="mt-14 sm:mt-16 flex justify-center">
                <div
                  className="inline-flex items-center gap-3 px-5 py-3 bg-[#F5C518] text-[#8a0a18]"
                  style={{ fontFamily: "var(--font-serif-tc)", fontWeight: 700 }}
                >
                  <span className="text-xs tracking-[0.3em] uppercase">
                    {promo.isExtension ? "早鳥加推倒數" : "早鳥倒數"}
                  </span>
                  <span className="text-2xl tabular-nums leading-none">
                    {promo.daysUntilEb}
                  </span>
                  <span className="text-xs tracking-wider">
                    日 · 截止 {promo.ebDateFormatted}
                  </span>
                </div>
              </div>
            </Reveal>
          )}
        </div>
      </section>

      {/* ===================================================================
          FULL PRICE LIST — embed the brand-designed pricing poster.
          Recreating the eligibility matrix (current/new/returning students,
          F1 vs F2–F3, registration fee waiver + coupon A/B) in JSX would
          lose the brand layout and double the maintenance surface, so we
          ship the poster as-is. The concise early-bird card above still
          serves at-a-glance shoppers; this section is for the parents who
          want every detail.
          =================================================================== */}
      <section className="relative bg-[#FBF7F0] py-20 sm:py-28">
        <div className="max-w-4xl mx-auto px-6">
          <Reveal>
            <div className="text-center text-[#B60D20]">
              <Eyebrow zh="收費及優惠" />
            </div>
          </Reveal>

          <Reveal delay={250}>
            <div className="mt-12 relative mx-auto max-w-xl">
              <div className="relative bg-white border border-[#F5C518]/40 p-3">
                <div className="relative overflow-hidden">
                  <Image
                    src="/summer/poster-pricing.jpg"
                    alt="完整收費及優惠表"
                    width={1600}
                    height={2000}
                    sizes="(min-width: 640px) 576px, 100vw"
                    quality={90}
                    className="w-full h-auto block"
                  />
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
                適用日期：2026年4月8日至6月15日
              </p>
              <p
                className="mt-3 text-center text-xs text-[#1A1614]/45 leading-relaxed px-4"
                style={{ fontFamily: "var(--font-serif-tc)" }}
              >
                * 優惠受條款及細則約束，如有任何爭議，MathConcept 數學思維 擁有最終解釋權。
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ===================================================================
          BRANCHES
          =================================================================== */}
      <section id="branches" className="relative bg-[#F2EAD8] py-20 sm:py-28">
        <div className="max-w-5xl mx-auto px-6">
          <Reveal>
            <div className="text-center text-[#B60D20]">
              <Eyebrow zh="上課地點" />
            </div>
          </Reveal>

          <div className="mt-16 space-y-16 sm:space-y-20">
            {config.locations.map((loc: SummerLocation, i) => {
              // Phone numbers are not in the config schema yet, so map by
              // location key. If we add more branches, move this to config.
              const contact = getBranchContact(loc);
              const openSet = new Set(loc.open_days || []);
              const branchImage =
                loc.image_url || BRANCH_IMAGES_FALLBACK[loc.name_en];
              const mapsHref = getBranchMapsUrl(loc);
              // Alternate photo side on desktop for magazine rhythm. Mobile
              // always stacks photo-above-text.
              const photoRight = i % 2 === 0;
              return (
              <Reveal key={loc.name} delay={150 + i * 150}>
                <div className="grid grid-cols-1 md:grid-cols-2 items-center gap-8 md:gap-14">
                  {branchImage && (
                    <a
                      href={mapsHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`relative block bg-white border border-[#F5C518]/40 p-2 shadow-sm transition-shadow duration-300 hover:shadow-md ${
                        photoRight ? "md:order-2" : "md:order-1"
                      }`}
                      aria-label={`在 Google 地圖查看 ${loc.name}`}
                    >
                      <div className="relative aspect-[3/2] overflow-hidden bg-[#FBF7F0]">
                        <Image
                          src={branchImage}
                          alt={loc.name}
                          fill
                          sizes="(min-width: 1280px) 440px, (min-width: 768px) 40vw, 100vw"
                          className="object-cover select-none"
                          draggable={false}
                        />
                      </div>
                      <CornerOrnament pos="tl" />
                      <CornerOrnament pos="tr" />
                      <CornerOrnament pos="bl" />
                      <CornerOrnament pos="br" />
                    </a>
                  )}
                  <div
                    className={`min-w-0 ${
                      photoRight ? "md:order-1" : "md:order-2"
                    }`}
                  >
                    <h3
                      className="text-2xl sm:text-3xl text-[#1A1614] leading-snug"
                      style={{
                        fontFamily: "var(--font-serif-tc)",
                        fontWeight: 700,
                      }}
                    >
                      {loc.name}
                    </h3>
                    {loc.name_en && (
                      <p className="text-[11px] tracking-[0.3em] text-[#B60D20]/70 uppercase mt-1.5">
                        {loc.name_en}
                      </p>
                    )}
                    {/* 7-day open strip — closed days ghosted with strikethrough,
                        same pattern as the apply form's branch cards. */}
                    {loc.open_days && loc.open_days.length > 0 && (
                      <div className="mt-4 flex items-center gap-1">
                        {WEEK_DAY_ORDER.map((day) => {
                          const isOpen = openSet.has(day);
                          return (
                            <span
                              key={day}
                              className={`inline-flex items-center justify-center w-6 h-6 text-[11px] tabular-nums ${
                                isOpen
                                  ? "bg-[#B60D20]/10 text-[#B60D20] font-semibold"
                                  : "text-[#1A1614]/40 line-through decoration-[#1A1614]/35"
                              }`}
                              style={{ fontFamily: "var(--font-serif-tc)" }}
                              aria-label={`星期${DAY_SHORT_ZH[day]} ${isOpen ? "開放" : "休息"}`}
                            >
                              {DAY_SHORT_ZH[day]}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    <a
                      href={mapsHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`在 Google 地圖查看 ${loc.name}：${loc.address}`}
                      className="group mt-5 inline-block text-sm sm:text-base text-[#1A1614]/75 leading-relaxed decoration-[#1A1614]/20 underline-offset-4 hover:text-[#B60D20] hover:decoration-[#B60D20]/40 underline transition-colors"
                      style={{ fontFamily: "var(--font-serif-tc)" }}
                    >
                      {loc.address}
                    </a>
                    {contact && (
                      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
                        <a
                          href={`tel:${contact.phone.replace(/\s+/g, "")}`}
                          className="inline-flex items-center gap-2 text-sm text-[#B60D20] hover:text-[#8a0a18] transition-colors"
                          style={{ fontFamily: "var(--font-serif-tc)", fontWeight: 600 }}
                        >
                          <Phone className="h-3.5 w-3.5" />
                          <span className="tabular-nums tracking-wider">{contact.phone}</span>
                        </a>
                        <button
                          type="button"
                          onClick={() => copyWechat(contact.wechat)}
                          className="group/wc inline-flex items-center gap-2 text-sm text-[#B60D20] hover:text-[#8a0a18] transition-colors"
                          style={{ fontFamily: "var(--font-serif-tc)", fontWeight: 600 }}
                          aria-label={`複製微信號 ${contact.wechat}`}
                          title={copiedWechat === contact.wechat ? "已複製" : "點擊複製"}
                        >
                          <WeChatIcon className="h-3.5 w-3.5" />
                          <span className="tracking-wider">{contact.wechat}</span>
                          {copiedWechat === contact.wechat ? (
                            <Check className="h-3 w-3 text-[#B60D20]" />
                          ) : (
                            <Copy className="h-3 w-3 text-[#B60D20]/30 group-hover/wc:text-[#B60D20]/70 transition-colors" />
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </Reveal>
              );
            })}
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
              <Eyebrow zh="常見問題" />
            </div>
          </Reveal>

          <Reveal delay={250}>
            <div className="mt-14 border-t border-[#1A1614]/15">
              {FAQS.map((f, i) => (
                <FaqItem
                  key={i}
                  q={f.q}
                  a={f.a}
                  qEn={f.qEn}
                  aEn={f.aEn}
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
          家長須知 — single tap-to-expand card with all attendance / makeup
          / payment / disclaimer rules. Closed by default so the section
          stays out of the way for casual browsers.
          =================================================================== */}
      <section className="relative bg-[#F2EAD8] pb-20 sm:pb-28 pt-4">
        <div className="max-w-3xl mx-auto px-6">
          <Reveal>
            <div className="text-center text-[#B60D20]">
              <Eyebrow zh="課堂須知" />
            </div>
          </Reveal>

          <Reveal delay={250}>
            <div className="mt-12 border border-[#1A1614]/15 bg-white">
              <button
                type="button"
                onClick={() => setRulesOpen((v) => !v)}
                className="w-full flex items-center gap-4 px-6 py-5 text-left group"
                aria-expanded={rulesOpen}
              >
                <span
                  className="flex-1 text-base sm:text-lg text-[#1A1614] leading-snug"
                  style={{ fontFamily: "var(--font-serif-tc)", fontWeight: 600 }}
                >
                  查看課堂安排及條款
                </span>
                <span className="shrink-0 text-[#B60D20]">
                  {rulesOpen ? <Minus className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
                </span>
              </button>
              <div
                className={`grid transition-all duration-500 ease-out ${
                  rulesOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                }`}
              >
                <div className="overflow-hidden">
                  <div className="px-6 sm:px-8 pb-8 pt-2 border-t border-[#1A1614]/10">
                    <ol
                      className="list-decimal list-outside ml-5 sm:ml-6 space-y-3 text-sm sm:text-[15px] text-[#1A1614]/80 leading-[1.9] marker:text-[#B60D20] marker:font-semibold"
                      style={{ fontFamily: "var(--font-sans-tc)" }}
                    >
                      {GENERAL_RULES.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ol>

                    <h4
                      className="mt-8 mb-3 text-base text-[#B60D20]"
                      style={{ fontFamily: "var(--font-serif-tc)", fontWeight: 700 }}
                    >
                      「中學暑期課程」相關細則
                    </h4>
                    <ol
                      className="list-decimal list-outside ml-5 sm:ml-6 space-y-3 text-sm sm:text-[15px] text-[#1A1614]/80 leading-[1.9] marker:text-[#B60D20] marker:font-semibold"
                      style={{ fontFamily: "var(--font-sans-tc)" }}
                    >
                      {SUMMER_RULES.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ol>

                    <p
                      className="mt-8 pt-5 border-t border-[#1A1614]/10 text-xs text-[#1A1614]/55 italic leading-relaxed"
                      style={{ fontFamily: "var(--font-serif-tc)" }}
                    >
                      本校可隨時修改本「家長須知」，而不作另行通知。如有任何爭議，數學思維教育中心將保留最終決定權。
                    </p>
                  </div>
                </div>
              </div>
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
          <Reveal delay={150}>
            <h2
              className="text-3xl sm:text-4xl md:text-5xl leading-[1.5] text-white"
              style={{ fontFamily: "var(--font-serif-tc)", fontWeight: 700 }}
            >
              暑假12個鐘
              <br />
              <span className="text-[#F5C518]">來年數學好輕鬆</span>
            </h2>
          </Reveal>

          <Reveal delay={300}>
            <div className="mt-14 flex flex-col items-center gap-4">
              <PrimaryCTA size="lg" />
              {promo.ebActive && promo.ebDateFormatted && (
                <p className="text-xs text-white/70 tracking-widest">
                  早鳥優惠｜{promo.ebDateFormatted}前報名
                </p>
              )}
            </div>
          </Reveal>

          <Reveal delay={500}>
            <div className="mt-16">
              <GoldRule />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ===================================================================
          LIGHTBOX — click any worksheet sample to open at readable size.
          Watermark is baked into the source JPGs, so no overlay needed.
          =================================================================== */}
      {lightbox && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="課堂教材樣本"
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-6 cursor-zoom-out"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative cursor-default"
            style={{
              height: "min(90vh, calc(90vw * 1684 / 1191))",
              aspectRatio: "1191 / 1684",
            }}
          >
            <Image
              src={lightbox}
              alt="課堂教材樣本"
              fill
              sizes="(min-width: 768px) 60vw, 90vw"
              quality={95}
              className="object-contain select-none"
              draggable={false}
            />
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setLightbox(null);
            }}
            aria-label="關閉"
            className="absolute top-5 right-5 sm:top-7 sm:right-7 inline-flex items-center justify-center w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white/90 hover:text-white backdrop-blur-sm transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  );
}
