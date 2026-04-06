"use client";

import { useState, useCallback } from "react";
import { summerAPI } from "@/lib/api";
import type { SummerApplicationStatusResponse } from "@/types";
import { type Lang, t, inputClass } from "@/lib/summer-utils";
import { parseHKTimestamp } from "@/lib/formatters";
import { Users } from "lucide-react";
import { BuddyCodeCard } from "@/components/summer/BuddyCodeCard";

const STATUS_STEPS = [
  "Submitted",
  "Under Review",
  "Placement Offered",
  "Placement Confirmed",
  "Fee Sent",
  "Paid",
  "Enrolled",
] as const;

const SIDE_EXIT_STATUSES = new Set(["Waitlisted", "Withdrawn", "Rejected"]);

const STATUS_LABELS: Record<string, { zh: string; en: string }> = {
  Submitted: { zh: "已提交", en: "Submitted" },
  "Under Review": { zh: "審核中", en: "Under Review" },
  "Placement Offered": { zh: "已安排名額", en: "Placement Offered" },
  "Placement Confirmed": { zh: "已確認名額", en: "Placement Confirmed" },
  "Fee Sent": { zh: "已發送繳費通知", en: "Fee Sent" },
  Paid: { zh: "已繳費", en: "Paid" },
  Enrolled: { zh: "已入學", en: "Enrolled" },
  Waitlisted: { zh: "候補中", en: "Waitlisted" },
  Withdrawn: { zh: "已退出", en: "Withdrawn" },
  Rejected: { zh: "未獲錄取", en: "Rejected" },
};

export default function SummerStatusPage() {
  const [lang, setLang] = useState<Lang>("zh");
  const [referenceCode, setReferenceCode] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SummerApplicationStatusResponse | null>(
    null
  );

  // Buddy management state
  const [buddyAction, setBuddyAction] = useState<"idle" | "join">("idle");
  const [buddyInput, setBuddyInput] = useState("");
  const [buddyReferrer, setBuddyReferrer] = useState("");
  const [buddyValidating, setBuddyValidating] = useState(false);
  const [buddyValid, setBuddyValid] = useState<boolean | null>(null);
  const [buddyMemberCount, setBuddyMemberCount] = useState<number | null>(null);
  const [buddyGroupFull, setBuddyGroupFull] = useState(false);
  const [buddyLoading, setBuddyLoading] = useState(false);
  const [buddyError, setBuddyError] = useState<string | null>(null);

  const resetBuddyState = () => {
    setBuddyAction("idle");
    setBuddyInput("");
    setBuddyReferrer("");
    setBuddyValid(null);
    setBuddyMemberCount(null);
    setBuddyGroupFull(false);
    setBuddyError(null);
  };

  const validateBuddyInput = useCallback(async (code: string) => {
    if (!code.trim()) return;
    setBuddyValidating(true);
    try {
      const res = await summerAPI.getBuddyGroup(code.trim());
      setBuddyValid(true);
      setBuddyMemberCount(res.member_count);
      setBuddyGroupFull(res.is_full);
    } catch {
      setBuddyValid(false);
      setBuddyMemberCount(null);
      setBuddyGroupFull(false);
    } finally {
      setBuddyValidating(false);
    }
  }, []);

  const handleBuddyChange = async (action: "join" | "leave" | "create") => {
    if (!result) return;
    setBuddyLoading(true);
    setBuddyError(null);
    try {
      const res = await summerAPI.changeBuddyGroup(
        referenceCode.trim(),
        phone.trim(),
        {
          action,
          buddy_code: action === "join" ? buddyInput.trim() : undefined,
          buddy_referrer_name: action === "join" ? buddyReferrer.trim() || undefined : undefined,
        }
      );
      setResult({
        ...result,
        buddy_code: res.buddy_code,
        buddy_group_member_count: res.member_count,
      });
      resetBuddyState();
    } catch (e: unknown) {
      setBuddyError(e instanceof Error ? e.message : "Failed to update buddy group");
    } finally {
      setBuddyLoading(false);
    }
  };

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const data = await summerAPI.checkStatus(
        referenceCode.trim(),
        phone.trim()
      );
      setResult(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Lookup failed");
    } finally {
      setLoading(false);
    }
  };

  const currentStepIndex = result
    ? STATUS_STEPS.indexOf(
        result.application_status as (typeof STATUS_STEPS)[number]
      )
    : -1;

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Language toggle */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setLang(lang === "zh" ? "en" : "zh")}
          className="text-sm text-primary hover:text-primary-hover font-medium"
        >
          {lang === "zh" ? "English" : "中文"}
        </button>
      </div>

      <h1 className="text-2xl font-bold text-center text-foreground">
        {t("報名狀態查詢", "Check Application Status", lang)}
      </h1>

      {/* Lookup form */}
      <form
        onSubmit={handleLookup}
        className="bg-card rounded-xl shadow-sm border border-border p-5 space-y-4"
      >
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            {t("參考編號", "Reference Code", lang)}
          </label>
          <input
            type="text"
            required
            value={referenceCode}
            onChange={(e) => setReferenceCode(e.target.value.toUpperCase())}
            className={inputClass}
            placeholder="SC2026-00001"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            {t("聯絡電話", "Contact Phone", lang)}
          </label>
          <input
            type="tel"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={inputClass}
            placeholder={t("報名時填寫的電話號碼", "Phone used during application", lang)}
          />
        </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 rounded-lg font-semibold text-primary-foreground bg-primary hover:bg-primary-hover disabled:bg-muted transition-colors"
        >
          {loading
            ? t("查詢中...", "Looking up...", lang)
            : t("查詢", "Look Up", lang)}
        </button>
      </form>

      {/* Result */}
      {result && (
        <div className="bg-card rounded-xl shadow-sm border border-border p-5 space-y-5">
          <div className="text-center space-y-1">
            <div className="text-sm text-muted-foreground">
              {result.reference_code}
            </div>
            <div className="text-lg font-semibold text-foreground">
              {result.student_name}
            </div>
          </div>

          {/* Side exit status */}
          {SIDE_EXIT_STATUSES.has(result.application_status) ? (
            <div className="text-center py-4">
              <div
                className={`inline-block px-4 py-2 rounded-full text-sm font-medium ${
                  result.application_status === "Waitlisted"
                    ? "bg-amber-100 text-amber-800"
                    : result.application_status === "Withdrawn"
                    ? "bg-slate-100 text-slate-600"
                    : "bg-red-100 text-red-800"
                }`}
              >
                {STATUS_LABELS[result.application_status]?.[lang] ||
                  result.application_status}
              </div>
            </div>
          ) : (
            /* Step indicator */
            <div className="space-y-1">
              {STATUS_STEPS.map((step, i) => {
                const isCompleted = i <= currentStepIndex;
                const isCurrent = i === currentStepIndex;
                const label = STATUS_LABELS[step]?.[lang] || step;
                return (
                  <div key={step} className="flex items-center gap-3">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                        isCurrent
                          ? "bg-primary text-primary-foreground ring-2 ring-primary/30"
                          : isCompleted
                          ? "bg-green-500 text-white"
                          : "bg-slate-200 text-slate-400"
                      }`}
                    >
                      {isCompleted && !isCurrent ? "\u2713" : i + 1}
                    </div>
                    <div
                      className={`text-sm ${
                        isCurrent
                          ? "font-semibold text-primary"
                          : isCompleted
                          ? "text-green-700"
                          : "text-slate-400"
                      }`}
                    >
                      {label}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {result.submitted_at && (
            <div className="text-xs text-muted-foreground text-center">
              {t("提交時間", "Submitted", lang)}:{" "}
              {parseHKTimestamp(result.submitted_at).toLocaleDateString(
                lang === "zh" ? "zh-HK" : "en-US",
                { year: "numeric", month: "long", day: "numeric" }
              )}
            </div>
          )}

          {/* Buddy Group Section */}
          <div className="border-t border-border pt-4 space-y-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">
                {t("同行優惠", "Buddy Group", lang)}
              </span>
            </div>

            {buddyError && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
                {buddyError}
              </div>
            )}

            {result.buddy_code ? (
              /* Has a buddy group */
              <div className="space-y-2">
                <BuddyCodeCard
                  code={result.buddy_code}
                  lang={lang}
                  memberCount={result.buddy_group_member_count}
                  includesSelf
                />
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => handleBuddyChange("leave")}
                    disabled={buddyLoading}
                    className="text-xs text-red-500 hover:text-red-700 underline disabled:opacity-50"
                  >
                    {buddyLoading
                      ? t("處理中...", "Processing...", lang)
                      : t("退出同行組", "Leave Group", lang)}
                  </button>
                </div>
              </div>
            ) : buddyAction === "idle" ? (
              /* No buddy group — show options */
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setBuddyAction("join")}
                  className="w-full py-2.5 text-sm font-medium border-2 border-primary text-primary rounded-xl hover:bg-primary/10 transition-colors"
                >
                  {t("輸入同行碼加入小組", "Enter a Buddy Code to Join", lang)}
                </button>
                <button
                  type="button"
                  onClick={() => handleBuddyChange("create")}
                  disabled={buddyLoading}
                  className="w-full py-2.5 text-sm font-medium border-2 border-dashed border-primary text-primary rounded-xl hover:bg-primary/10 transition-colors disabled:opacity-50"
                >
                  {buddyLoading
                    ? t("建立中...", "Creating...", lang)
                    : t("建立新的同行碼", "Create a New Buddy Code", lang)}
                </button>
              </div>
            ) : (
              /* Join flow */
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={buddyInput}
                    onChange={(e) => {
                      setBuddyInput(e.target.value.toUpperCase());
                      setBuddyValid(null);
                    }}
                    onPaste={(e) => {
                      const pasted = e.clipboardData.getData("text").trim().toUpperCase();
                      if (/^BG-[A-Z0-9]{4}$/.test(pasted)) {
                        e.preventDefault();
                        setBuddyInput(pasted);
                        validateBuddyInput(pasted);
                      }
                    }}
                    className={`${inputClass} flex-1`}
                    placeholder="BG-XXXX"
                  />
                  <button
                    type="button"
                    onClick={() => validateBuddyInput(buddyInput)}
                    disabled={buddyValidating}
                    className={`px-4 py-2.5 text-sm font-medium rounded-xl transition-colors disabled:opacity-50 ${
                      buddyInput.trim() && buddyValid === null
                        ? "bg-primary text-primary-foreground hover:bg-primary-hover animate-pulse"
                        : "bg-secondary text-secondary-foreground hover:bg-muted"
                    }`}
                  >
                    {buddyValidating
                      ? "..."
                      : t("驗證", "Verify", lang)}
                  </button>
                </div>
                {buddyValid === true && buddyGroupFull && (
                  <div className="text-xs text-red-600">
                    {t(
                      "此同行組已滿（最多3人）。請建立新的同行碼或輸入其他同行碼。",
                      "This group is full (max 3 members). Please create a new code or enter a different one.",
                      lang
                    )}
                  </div>
                )}
                {buddyValid === true && !buddyGroupFull && (
                  <div className="space-y-2">
                    <div className="text-xs text-green-600">
                      {t(
                        `同行碼有效（目前 ${buddyMemberCount} 人已加入）`,
                        `Valid code (${buddyMemberCount} member(s) joined)`,
                        lang
                      )}
                    </div>
                    <input
                      type="text"
                      value={buddyReferrer}
                      onChange={(e) => setBuddyReferrer(e.target.value)}
                      className={inputClass}
                      placeholder={t(
                        "誰將此同行碼分享給你？",
                        "Who shared this code with you?",
                        lang
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => handleBuddyChange("join")}
                      disabled={buddyLoading || !buddyReferrer.trim()}
                      className="w-full py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-xl hover:bg-primary-hover transition-colors disabled:opacity-50"
                    >
                      {buddyLoading
                        ? t("加入中...", "Joining...", lang)
                        : t("加入同行組", "Join Group", lang)}
                    </button>
                  </div>
                )}
                {buddyValid === false && (
                  <div className="text-xs text-red-600">
                    {t("同行碼無效", "Invalid buddy code", lang)}
                  </div>
                )}
                <button
                  type="button"
                  onClick={resetBuddyState}
                  className="text-xs text-muted-foreground hover:text-foreground underline"
                >
                  {t("取消", "Cancel", lang)}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Link to apply */}
      <div className="text-center">
        <a
          href="/summer/apply"
          className="text-sm text-primary hover:text-primary-hover"
        >
          {t("前往報名", "Go to Application Form", lang)}
        </a>
      </div>
    </div>
  );
}
