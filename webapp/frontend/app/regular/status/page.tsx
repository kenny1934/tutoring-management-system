"use client";

import { Fragment, useState, useCallback } from "react";
import { regularAPI } from "@/lib/api";
import type {
  RegularApplicationStatusResponse,
  RegularApplicationEditRequest,
  RegularCourseFormConfig,
  RegularLocation,
} from "@/types";
import {
  type Lang,
  t,
  inputClass,
  dayLabel,
  labelForOption,
  REGULAR_STATUS_STEPS,
  REGULAR_EXIT_STATUSES,
  regularStatusLabel,
  getRegularTimeSlots,
} from "@/lib/regular-utils";
import { parseHKTimestamp } from "@/lib/formatters";
import { Pencil, Lock } from "lucide-react";
import { WeChatIcon } from "@/components/parent-contacts/contact-utils";

type EditSection = "background" | "preferences" | null;

export default function RegularStatusPage() {
  const [lang, setLang] = useState<Lang>("zh");
  const [referenceCode, setReferenceCode] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RegularApplicationStatusResponse | null>(
    null
  );

  // Self-edit state
  const [formConfig, setFormConfig] = useState<RegularCourseFormConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [editingSection, setEditingSection] = useState<EditSection>(null);
  const [editForm, setEditForm] = useState<RegularApplicationEditRequest>({});
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const isSubmitted = result?.application_status === "Submitted";

  const ensureConfig = useCallback(async () => {
    if (formConfig || configLoading) return;
    setConfigLoading(true);
    try {
      const cfg = await regularAPI.getFormConfig();
      setFormConfig(cfg);
    } catch {
      // Edit form will fall back to plain text inputs if config fails to load
    } finally {
      setConfigLoading(false);
    }
  }, [formConfig, configLoading]);

  const openEdit = async (section: Exclude<EditSection, null>) => {
    if (!result) return;
    setEditError(null);
    setEditingSection(section);
    setEditForm({
      grade: result.grade ?? "",
      school: result.school ?? "",
      lang_stream: result.lang_stream ?? "",
      wechat_id: result.wechat_id ?? "",
      preferred_location: result.preferred_location ?? "",
      preference_1_day: result.preference_1_day ?? "",
      preference_1_time: result.preference_1_time ?? "",
      preference_2_day: result.preference_2_day ?? "",
      preference_2_time: result.preference_2_time ?? "",
    });
    ensureConfig();
  };

  const closeEdit = () => {
    setEditingSection(null);
    setEditForm({});
    setEditError(null);
  };

  const saveEdit = async () => {
    if (!result) return;
    setEditSaving(true);
    setEditError(null);
    // Only send the fields belonging to the section being edited so an
    // unrelated bug in one form can't accidentally clobber another section.
    const payload: RegularApplicationEditRequest =
      editingSection === "background"
        ? {
            grade: editForm.grade,
            school: editForm.school,
            lang_stream: editForm.lang_stream,
            wechat_id: editForm.wechat_id,
          }
        : {
            preferred_location: editForm.preferred_location,
            preference_1_day: editForm.preference_1_day,
            preference_1_time: editForm.preference_1_time,
            preference_2_day: editForm.preference_2_day,
            preference_2_time: editForm.preference_2_time,
          };
    try {
      const updated = await regularAPI.editApplication(
        referenceCode.trim(),
        phone.trim(),
        payload,
      );
      setResult(updated);
      closeEdit();
    } catch (e: unknown) {
      setEditError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setEditSaving(false);
    }
  };

  const selectedLocation: RegularLocation | undefined = formConfig?.locations.find(
    (l) => l.name === editForm.preferred_location,
  );
  const slotDays = selectedLocation?.open_days ?? [];
  const slotsForDay = (day: string): string[] => {
    if (!selectedLocation || !day) return [];
    return getRegularTimeSlots(formConfig, selectedLocation.name, day);
  };

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const data = await regularAPI.checkStatus(
        referenceCode.trim(),
        phone.trim()
      );
      setResult(data);
      ensureConfig();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Lookup failed");
    } finally {
      setLoading(false);
    }
  };

  const currentStepIndex = result
    ? REGULAR_STATUS_STEPS.indexOf(
        result.application_status as (typeof REGULAR_STATUS_STEPS)[number]
      )
    : -1;

  return (
    <div
      className="no-image-save space-y-6 max-w-2xl mx-auto"
      onContextMenu={(e) => {
        if (e.target instanceof HTMLImageElement) e.preventDefault();
      }}
    >
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
            placeholder="RC2026-00001"
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
          {REGULAR_EXIT_STATUSES.has(result.application_status) ? (
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
                {regularStatusLabel(result.application_status, lang)}
              </div>
            </div>
          ) : (
            /* Step indicator */
            <div className="space-y-1">
              {REGULAR_STATUS_STEPS.map((step, i) => {
                const isCompleted = i <= currentStepIndex;
                const isCurrent = i === currentStepIndex;
                const label = regularStatusLabel(step, lang);
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
                      {isCompleted && !isCurrent ? "✓" : i + 1}
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

          {/* Lock banner when admin has moved the application out of Submitted */}
          {!isSubmitted && !REGULAR_EXIT_STATUSES.has(result.application_status) && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <Lock className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                {t(
                  "報名表正在處理中，無法在此頁面自助修改。如需更新資料，請與我們聯絡。",
                  "Your application is being processed and can no longer be edited here. Please contact us to make changes.",
                  lang,
                )}
              </div>
            </div>
          )}

          {/* --- Background section --- */}
          <div className="border-t border-border pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">
                {t("學生資料", "Student Background", lang)}
              </span>
              {isSubmitted && editingSection !== "background" && (
                <button
                  type="button"
                  onClick={() => openEdit("background")}
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary-hover"
                >
                  <Pencil className="h-3 w-3" />
                  {t("修改", "Edit", lang)}
                </button>
              )}
            </div>
            {editingSection === "background" ? (
              <div className="space-y-2">
                <div>
                  <label className="block text-[11px] text-muted-foreground mb-1">
                    {t("年級", "Grade", lang)}
                  </label>
                  <input
                    type="text"
                    value={editForm.grade ?? ""}
                    onChange={(e) => setEditForm({ ...editForm, grade: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-muted-foreground mb-1">
                    {t("學校", "School", lang)}
                  </label>
                  <input
                    type="text"
                    value={editForm.school ?? ""}
                    onChange={(e) => setEditForm({ ...editForm, school: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-muted-foreground mb-1">
                    {t("授課語言", "Language Stream", lang)}
                  </label>
                  {formConfig?.lang_stream_options && formConfig.lang_stream_options.length > 0 ? (
                    <select
                      value={editForm.lang_stream ?? ""}
                      onChange={(e) => setEditForm({ ...editForm, lang_stream: e.target.value })}
                      className={inputClass}
                    >
                      <option value="">--</option>
                      {formConfig.lang_stream_options.map((opt) => (
                        <option key={opt.value ?? opt.name} value={opt.value ?? opt.name}>
                          {lang === "zh" ? opt.name : opt.name_en}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={editForm.lang_stream ?? ""}
                      onChange={(e) => setEditForm({ ...editForm, lang_stream: e.target.value })}
                      className={inputClass}
                    />
                  )}
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1">
                    <WeChatIcon className="h-3.5 w-3.5 text-green-600" />
                    WeChat ID
                  </label>
                  <input
                    type="text"
                    value={editForm.wechat_id ?? ""}
                    onChange={(e) => setEditForm({ ...editForm, wechat_id: e.target.value })}
                    className={inputClass}
                  />
                </div>
                {editError && <div className="text-xs text-red-600">{editError}</div>}
                <div className="flex justify-end gap-2 pt-1">
                  <button type="button" onClick={closeEdit} className="text-xs px-3 py-1 text-muted-foreground hover:text-foreground">
                    {t("取消", "Cancel", lang)}
                  </button>
                  <button
                    type="button"
                    onClick={saveEdit}
                    disabled={editSaving}
                    className="text-xs font-medium px-3 py-1 rounded-lg bg-primary text-primary-foreground disabled:opacity-50"
                  >
                    {editSaving ? t("儲存中...", "Saving...", lang) : t("儲存", "Save", lang)}
                  </button>
                </div>
              </div>
            ) : (
              <dl className="grid grid-cols-2 gap-y-1 text-xs">
                <dt className="text-muted-foreground">{t("年級", "Grade", lang)}</dt>
                <dd className="text-foreground">{labelForOption(formConfig?.available_grades, result.grade, lang)}</dd>
                <dt className="text-muted-foreground">{t("學校", "School", lang)}</dt>
                <dd className="text-foreground">{result.school || "—"}</dd>
                <dt className="text-muted-foreground">{t("授課語言", "Language Stream", lang)}</dt>
                <dd className="text-foreground">{labelForOption(formConfig?.lang_stream_options, result.lang_stream, lang)}</dd>
                <dt className="text-muted-foreground inline-flex items-center gap-1">
                  <WeChatIcon className="h-3 w-3 text-green-600" />
                  WeChat
                </dt>
                <dd className="text-foreground">{result.wechat_id || "—"}</dd>
              </dl>
            )}
          </div>

          {/* --- Class Preferences section --- */}
          <div className="border-t border-border pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">
                {t("上課偏好", "Class Preferences", lang)}
              </span>
              {isSubmitted && editingSection !== "preferences" && (
                <button
                  type="button"
                  onClick={() => openEdit("preferences")}
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary-hover"
                >
                  <Pencil className="h-3 w-3" />
                  {t("修改", "Edit", lang)}
                </button>
              )}
            </div>
            {editingSection === "preferences" ? (
              <div className="space-y-2">
                <div>
                  <label className="block text-[11px] text-muted-foreground mb-1">
                    {t("分校", "Location", lang)}
                  </label>
                  {formConfig ? (
                    <select
                      value={editForm.preferred_location ?? ""}
                      onChange={(e) => setEditForm({
                        ...editForm,
                        preferred_location: e.target.value,
                        preference_1_day: "",
                        preference_1_time: "",
                        preference_2_day: "",
                        preference_2_time: "",
                      })}
                      className={inputClass}
                    >
                      <option value="">--</option>
                      {formConfig.locations.map((l) => (
                        <option key={l.name} value={l.name}>{lang === "zh" ? l.name : l.name_en}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={editForm.preferred_location ?? ""}
                      onChange={(e) => setEditForm({ ...editForm, preferred_location: e.target.value })}
                      className={inputClass}
                    />
                  )}
                </div>
                {([
                  { n: 1 as const, zh: "主要時段", en: "Main Slot" },
                  { n: 2 as const, zh: "後備時段", en: "Backup Slot" },
                ]).map(({ n, zh: labelZh, en: labelEn }) => {
                  const dayKey = `preference_${n}_day` as const;
                  const timeKey = `preference_${n}_time` as const;
                  const dayVal = editForm[dayKey] ?? "";
                  const timeVal = editForm[timeKey] ?? "";
                  return (
                    <div key={n} className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] text-muted-foreground mb-1">
                          {t(`${labelZh} - 日`, `${labelEn} - Day`, lang)}
                        </label>
                        {selectedLocation ? (
                          <select
                            value={dayVal}
                            onChange={(e) => setEditForm({ ...editForm, [dayKey]: e.target.value, [timeKey]: "" })}
                            className={inputClass}
                          >
                            <option value="">--</option>
                            {slotDays.map((d) => <option key={d} value={d}>{dayLabel(d, lang)}</option>)}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={dayVal}
                            onChange={(e) => setEditForm({ ...editForm, [dayKey]: e.target.value })}
                            className={inputClass}
                          />
                        )}
                      </div>
                      <div>
                        <label className="block text-[11px] text-muted-foreground mb-1">
                          {t(`${labelZh} - 時段`, `${labelEn} - Time`, lang)}
                        </label>
                        {selectedLocation && dayVal ? (
                          <select
                            value={timeVal}
                            onChange={(e) => setEditForm({ ...editForm, [timeKey]: e.target.value })}
                            className={inputClass}
                          >
                            <option value="">--</option>
                            {slotsForDay(dayVal).map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={timeVal}
                            onChange={(e) => setEditForm({ ...editForm, [timeKey]: e.target.value })}
                            className={inputClass}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
                {editError && <div className="text-xs text-red-600">{editError}</div>}
                <div className="flex justify-end gap-2 pt-1">
                  <button type="button" onClick={closeEdit} className="text-xs px-3 py-1 text-muted-foreground hover:text-foreground">
                    {t("取消", "Cancel", lang)}
                  </button>
                  <button
                    type="button"
                    onClick={saveEdit}
                    disabled={editSaving}
                    className="text-xs font-medium px-3 py-1 rounded-lg bg-primary text-primary-foreground disabled:opacity-50"
                  >
                    {editSaving ? t("儲存中...", "Saving...", lang) : t("儲存", "Save", lang)}
                  </button>
                </div>
              </div>
            ) : (
              <dl className="grid grid-cols-2 gap-y-1 text-xs">
                <dt className="text-muted-foreground">{t("分校", "Location", lang)}</dt>
                <dd className="text-foreground">{labelForOption(formConfig?.locations, result.preferred_location, lang)}</dd>
                {[
                  { zh: "主要時段", en: "Main Slot", day: result.preference_1_day, time: result.preference_1_time },
                  { zh: "後備時段", en: "Backup Slot", day: result.preference_2_day, time: result.preference_2_time },
                ].map((r) => (
                  <Fragment key={r.en}>
                    <dt className="text-muted-foreground">{t(r.zh, r.en, lang)}</dt>
                    <dd className="text-foreground">
                      {r.day && r.time ? `${dayLabel(r.day, lang)} ${r.time}` : "—"}
                    </dd>
                  </Fragment>
                ))}
              </dl>
            )}
          </div>
        </div>
      )}

      {/* Link to apply */}
      <div className="text-center">
        <a
          href="/regular/apply"
          className="text-sm text-primary hover:text-primary-hover"
        >
          {t("前往填寫報名表", "Go to Application Form", lang)}
        </a>
      </div>
    </div>
  );
}
