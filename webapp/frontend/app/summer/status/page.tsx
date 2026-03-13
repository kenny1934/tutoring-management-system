"use client";

import { useState } from "react";
import { summerAPI } from "@/lib/api";
import type { SummerApplicationStatusResponse } from "@/types";
import { type Lang, t, inputClass } from "@/lib/summer-utils";
import { parseHKTimestamp } from "@/lib/formatters";

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
    <div className="space-y-6">
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
