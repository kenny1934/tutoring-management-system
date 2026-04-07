"use client";

import { useState, useCallback } from "react";
import { summerAPI } from "@/lib/api";
import type {
  SummerApplicationStatusResponse,
  SummerApplicationEditRequest,
  SummerCourseFormConfig,
  SummerLocation,
  SummerSiblingInfo,
} from "@/types";
import { type Lang, t, inputClass, dayLabel, labelForOption, frequencyLabel } from "@/lib/summer-utils";
import { parseHKTimestamp } from "@/lib/formatters";
import { Users, Plus, X, Pencil, Lock } from "lucide-react";
import { WeChatIcon } from "@/components/parent-contacts/contact-utils";
import { BuddyCodeCard } from "@/components/summer/BuddyCodeCard";

type EditSection = "background" | "preferences" | null;

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
  const [buddyMaxMembers, setBuddyMaxMembers] = useState(3);
  const [buddyLoading, setBuddyLoading] = useState(false);
  const [buddyError, setBuddyError] = useState<string | null>(null);

  // Self-edit state
  const [formConfig, setFormConfig] = useState<SummerCourseFormConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [editingSection, setEditingSection] = useState<EditSection>(null);
  const [editForm, setEditForm] = useState<SummerApplicationEditRequest>({});
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const isSubmitted = result?.application_status === "Submitted";

  const ensureConfig = useCallback(async () => {
    if (formConfig || configLoading) return;
    setConfigLoading(true);
    try {
      const cfg = await summerAPI.getFormConfig();
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
      unavailability_notes: result.unavailability_notes ?? "",
      sessions_per_week: result.sessions_per_week ?? 1,
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
    const payload: SummerApplicationEditRequest =
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
            unavailability_notes: editForm.unavailability_notes,
            sessions_per_week: editForm.sessions_per_week,
          };
    try {
      const updated = await summerAPI.editApplication(
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

  const selectedLocation: SummerLocation | undefined = formConfig?.locations.find(
    (l) => l.name === editForm.preferred_location,
  );
  const slotDays = selectedLocation?.open_days ?? [];
  const slotsForDay = (day: string): string[] => {
    if (!selectedLocation || !day) return [];
    const ts = selectedLocation.time_slots as Record<string, string[]> | undefined;
    return ts?.[day] ?? [];
  };

  const [siblingFormOpen, setSiblingFormOpen] = useState(false);
  const [sibName, setSibName] = useState("");
  const [sibBranch, setSibBranch] = useState("");
  const [siblingSubmitting, setSiblingSubmitting] = useState(false);
  const [siblingError, setSiblingError] = useState<string | null>(null);

  const primaryBranches = result?.primary_branch_options ?? [];
  const branchLabel = (code: string) => {
    const b = primaryBranches.find((x) => x.code === code);
    if (!b) return code;
    return lang === "zh" ? b.name_zh : b.name_en;
  };

  const declareSibling = async () => {
    if (!result) return;
    setSiblingError(null);
    setSiblingSubmitting(true);
    try {
      const sib = await summerAPI.declareSibling(referenceCode.trim(), phone.trim(), {
        name_en: sibName.trim(),
        source_branch: sibBranch,
      });
      setResult({
        ...result,
        buddy_siblings: [...(result.buddy_siblings ?? []), sib],
        buddy_group_member_count: (result.buddy_group_member_count ?? 0) + 1,
      });
      setSibName("");
      setSibBranch("");
      setSiblingFormOpen(false);
    } catch (e: unknown) {
      setSiblingError(e instanceof Error ? e.message : "Failed to declare sibling");
    } finally {
      setSiblingSubmitting(false);
    }
  };

  const removeSibling = async (sib: SummerSiblingInfo) => {
    if (!result) return;
    try {
      await summerAPI.removeSibling(referenceCode.trim(), phone.trim(), sib.id);
      setResult({
        ...result,
        buddy_siblings: (result.buddy_siblings ?? []).filter((s) => s.id !== sib.id),
        buddy_group_member_count: Math.max(0, (result.buddy_group_member_count ?? 0) - 1),
      });
    } catch (e: unknown) {
      setSiblingError(e instanceof Error ? e.message : "Failed to remove sibling");
    }
  };

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
      setBuddyMaxMembers(res.max_members);
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
      ensureConfig();
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

          {/* Lock banner when admin has moved the application out of Submitted */}
          {!isSubmitted && !SIDE_EXIT_STATUSES.has(result.application_status) && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <Lock className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                {t(
                  "報名表正在審核中，無法在此頁面自助修改。如需更新資料，請與我們聯絡。",
                  "Your application is being reviewed and can no longer be edited here. Please contact us to make changes.",
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
                <div>
                  <label className="block text-[11px] text-muted-foreground mb-1">
                    {t("每週堂數", "Sessions per week", lang)}
                  </label>
                  <select
                    value={editForm.sessions_per_week ?? 1}
                    onChange={(e) => setEditForm({ ...editForm, sessions_per_week: Number(e.target.value) })}
                    className={inputClass}
                  >
                    <option value={1}>{frequencyLabel(1, lang)}</option>
                    <option value={2}>{frequencyLabel(2, lang)}</option>
                  </select>
                </div>
                {([1, 2] as const).map((n) => {
                  const dayKey = (n === 1 ? "preference_1_day" : "preference_2_day") as
                    | "preference_1_day"
                    | "preference_2_day";
                  const timeKey = (n === 1 ? "preference_1_time" : "preference_2_time") as
                    | "preference_1_time"
                    | "preference_2_time";
                  const dayVal = editForm[dayKey] ?? "";
                  const timeVal = editForm[timeKey] ?? "";
                  return (
                    <div key={n} className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] text-muted-foreground mb-1">
                          {t(`第${n === 1 ? "一" : "二"}志願 - 日`, `Pref ${n} Day`, lang)}
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
                          {t(`第${n === 1 ? "一" : "二"}志願 - 時段`, `Pref ${n} Time`, lang)}
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
                <div>
                  <label className="block text-[11px] text-muted-foreground mb-1">
                    {t("不便上課時間 / 備註", "Unavailable times / notes", lang)}
                  </label>
                  <textarea
                    value={editForm.unavailability_notes ?? ""}
                    onChange={(e) => setEditForm({ ...editForm, unavailability_notes: e.target.value })}
                    className={inputClass}
                    rows={2}
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
                <dt className="text-muted-foreground">{t("分校", "Location", lang)}</dt>
                <dd className="text-foreground">{labelForOption(formConfig?.locations, result.preferred_location, lang)}</dd>
                <dt className="text-muted-foreground">{t("每週堂數", "Sessions per week", lang)}</dt>
                <dd className="text-foreground">{frequencyLabel(result.sessions_per_week ?? 1, lang)}</dd>
                <dt className="text-muted-foreground">{t("第一志願", "1st preference", lang)}</dt>
                <dd className="text-foreground">
                  {result.preference_1_day ? dayLabel(result.preference_1_day, lang) : "—"} {result.preference_1_time || ""}
                </dd>
                <dt className="text-muted-foreground">{t("第二志願", "2nd preference", lang)}</dt>
                <dd className="text-foreground">
                  {result.preference_2_day ? dayLabel(result.preference_2_day, lang) : "—"} {result.preference_2_time || ""}
                </dd>
                {result.unavailability_notes && (
                  <>
                    <dt className="text-muted-foreground col-span-2 mt-1">{t("備註", "Notes", lang)}</dt>
                    <dd className="text-foreground col-span-2">{result.unavailability_notes}</dd>
                  </>
                )}
              </dl>
            )}
          </div>

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

                {/* Primary / KidsConcept siblings */}
                <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3 space-y-2">
                  <div className="text-xs font-semibold text-foreground">
                    {t("數學思維 / KidsConcept 弟妹", "Younger Siblings at Primary / KidsConcept", lang)}
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {t(
                      "此同行碼只適用於中學教室。如有弟妹報讀數學思維或 KidsConcept，請於此登記，他們仍可計入同行優惠人數，由管理員核實。",
                      "This buddy code is for Secondary only. If a younger sibling is applying to Primary / KidsConcept, declare them here so they count toward the group discount. An admin will verify.",
                      lang
                    )}
                  </p>
                  {(result.buddy_siblings ?? []).length > 0 && (
                    <div className="space-y-1.5">
                      {(result.buddy_siblings ?? []).map((sib) => (
                        <div key={sib.id} className="flex items-center gap-2 rounded-lg bg-card border border-border p-2">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-foreground truncate">{sib.name_en}</div>
                            <div className="text-[11px] text-muted-foreground">{branchLabel(sib.source_branch)}</div>
                          </div>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${
                              sib.verification_status === "Confirmed"
                                ? "bg-green-100 text-green-700"
                                : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {sib.verification_status === "Confirmed"
                              ? t("已核實", "Confirmed", lang)
                              : t("待核實", "Pending", lang)}
                          </span>
                          {sib.can_remove && (
                            <button
                              type="button"
                              onClick={() => removeSibling(sib)}
                              className="p-1 text-muted-foreground hover:text-red-600 shrink-0"
                              aria-label={t("移除", "Remove", lang)}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {siblingError && (
                    <div className="text-[11px] text-red-600">{siblingError}</div>
                  )}
                  {!siblingFormOpen ? (
                    <button
                      type="button"
                      onClick={() => setSiblingFormOpen(true)}
                      disabled={
                        (result.buddy_group_member_count ?? 0) >= 3 || primaryBranches.length === 0
                      }
                      className="w-full py-1.5 text-xs font-medium border border-dashed border-amber-400 text-amber-800 rounded-lg hover:bg-amber-100/50 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      {t("登記弟妹", "Declare a younger sibling", lang)}
                    </button>
                  ) : (
                    <div className="space-y-2 rounded-lg border border-amber-200 bg-card p-2">
                      <input
                        type="text"
                        value={sibName}
                        onChange={(e) => setSibName(e.target.value)}
                        placeholder={t("弟妹英文姓名", "Younger sibling's English name", lang)}
                        className={inputClass}
                      />
                      <div className="text-[11px] text-muted-foreground">
                        {t("正報讀的分校", "Applying at branch", lang)}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {primaryBranches.map((b) => {
                          const selected = sibBranch === b.code;
                          return (
                            <button
                              key={b.code}
                              type="button"
                              onClick={() => setSibBranch(b.code)}
                              className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                                selected
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "bg-card text-foreground border-border hover:border-primary/50"
                              }`}
                            >
                              {lang === "zh" ? b.name_zh : b.name_en}
                            </button>
                          );
                        })}
                      </div>
                      <div className="flex items-center gap-2 justify-end pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setSiblingFormOpen(false);
                            setSiblingError(null);
                            setSibName("");
                            setSibBranch("");
                          }}
                          className="text-[11px] text-muted-foreground hover:text-foreground px-2 py-1"
                        >
                          {t("取消", "Cancel", lang)}
                        </button>
                        <button
                          type="button"
                          disabled={!sibName.trim() || !sibBranch || siblingSubmitting}
                          onClick={declareSibling}
                          className="text-[11px] font-medium px-3 py-1 rounded-lg bg-primary text-primary-foreground disabled:opacity-50"
                        >
                          {siblingSubmitting
                            ? t("提交中...", "Submitting...", lang)
                            : t("加入", "Add", lang)}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

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
                      `此同行組已滿（最多${buddyMaxMembers}人）。請建立新的同行碼或輸入其他同行碼。`,
                      `This group is full (max ${buddyMaxMembers} members). Please create a new code or enter a different one.`,
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
