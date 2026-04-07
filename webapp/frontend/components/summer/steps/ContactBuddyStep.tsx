import { useState } from "react";
import { Phone, BadgePercent, Plus, X, Info } from "lucide-react";
import { WeChatIcon } from "@/components/parent-contacts/contact-utils";
import type { SummerCourseFormConfig, SummerSiblingDeclaration } from "@/types";
import {
  type Lang,
  t,
  inputClass,
  sectionClass,
  labelClass,
  radioGroupClass,
  radioLabelClass,
  RequiredMark,
  IconLabel,
  getActiveSummerPromo,
} from "@/lib/summer-utils";
import { BuddyCodeCard } from "@/components/summer/BuddyCodeCard";

interface ContactBuddyStepProps {
  config?: SummerCourseFormConfig;
  lang: Lang;
  wechatId: string;
  setWechatId: (v: string) => void;
  contactPhone: string;
  setContactPhone: (v: string) => void;
  buddyMode: "none" | "code";
  setBuddyMode: (v: "none" | "code") => void;
  buddyCode: string;
  setBuddyCode: (v: string) => void;
  buddyCodeValid: boolean | null;
  setBuddyCodeValid: (v: boolean | null) => void;
  buddyMemberCount: number | null;
  validateBuddyCode: (code: string) => void;
  handleCreateBuddyGroup: () => void;
  onResetBuddyCode: () => void;
  buddyReferrerName: string;
  setBuddyReferrerName: (v: string) => void;
  buddyCodeIsOwn: boolean;
  buddyGroupFull: boolean;
  buddyMaxMembers: number;
  declaredSibling: SummerSiblingDeclaration | null;
  setDeclaredSibling: (v: SummerSiblingDeclaration | null) => void;
}

export function ContactBuddyStep({
  config,
  lang,
  wechatId,
  setWechatId,
  contactPhone,
  setContactPhone,
  buddyMode,
  setBuddyMode,
  buddyCode,
  setBuddyCode,
  buddyCodeValid,
  setBuddyCodeValid,
  buddyMemberCount,
  validateBuddyCode,
  handleCreateBuddyGroup,
  onResetBuddyCode,
  buddyReferrerName,
  setBuddyReferrerName,
  buddyCodeIsOwn,
  buddyGroupFull,
  buddyMaxMembers,
  declaredSibling,
  setDeclaredSibling,
}: ContactBuddyStepProps) {
  const groupSavings = config
    ? getActiveSummerPromo(config.pricing_config, lang).groupSavings
    : null;
  const primaryBranches = config?.primary_branch_options ?? [];
  const buddyJoined = buddyMode === "code" && buddyCodeValid && !buddyGroupFull;
  // Effective member count (group + this applicant if creator + declared sibling)
  const effectiveCount = (buddyMemberCount ?? 0) + (declaredSibling ? 1 : 0);
  const effectiveFull = effectiveCount >= buddyMaxMembers;

  return (
    <div className="space-y-6">
      {/* Contact */}
      <div className={sectionClass}>
        <div>
          <label className={labelClass}>
            <IconLabel icon={WeChatIcon}>
              {t("微信號", "WeChat ID", lang)}
            </IconLabel>
          </label>
          <p className="text-xs text-muted-foreground -mt-1 mb-2 leading-relaxed">
            {t(
              "我們會用微信發送上課資訊。",
              "We'll send class information via WeChat.",
              lang
            )}
          </p>
          <input
            type="text"
            value={wechatId}
            onChange={(e) => setWechatId(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>
            <IconLabel icon={Phone}>
              {t("聯絡電話", "Contact phone", lang)}
            </IconLabel>
          </label>
          <input
            type="tel"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      {/* Buddy Group */}
      <div className={sectionClass}>
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-base font-semibold text-foreground leading-snug">
            {t(
              config?.text_content?.buddy_title_zh || "同行優惠",
              config?.text_content?.buddy_title_en || "Buddy Group Discount",
              lang
            )}
          </h2>
          {groupSavings !== null && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-800">
              <BadgePercent className="h-3 w-3" />
              {t(`每人減 $${groupSavings}`, `$${groupSavings} off each`, lang)}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {groupSavings !== null
            ? t(
                `三人或以上同行報名，每人可減 $${groupSavings}。輸入朋友的同行碼加入小組，或建立新的同行碼分享給朋友。`,
                `When 3 or more apply together, each person saves $${groupSavings}. Enter a friend's buddy code to join their group, or create a new code to share.`,
                lang
              )
            : t(
                config?.text_content?.buddy_description_zh || "三人或以上同行報名可享團報優惠。您可以輸入同行碼加入已有的小組，或建立新的同行碼分享給朋友。",
                config?.text_content?.buddy_description_en || "Groups of 3 or more get a group discount. Enter a buddy code to join an existing group, or create a new code to share with friends.",
                lang
              )}
        </p>
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900 leading-relaxed flex gap-2">
          <Info className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
          <div>
            {t(
              "此同行碼只適用於 MathConcept 中學教室暑期課程。MathConcept 數學思維 / KidsConcept 使用獨立系統，編號並不通用。如有弟妹正報讀數學思維或 KidsConcept，請於下方登記，他們仍可計入同行優惠人數。",
              "This buddy code is only for MathConcept Secondary Academy summer course. MathConcept Education / KidsConcept use a separate code system. If you have a younger sibling applying to a Primary or KidsConcept branch, declare them below; they still count toward the 3-person group.",
              lang
            )}
          </div>
        </div>

        <div className="space-y-3">
          <div className={radioGroupClass}>
            <label className={radioLabelClass(buddyMode === "none")}>
              <input
                type="radio"
                name="buddyMode"
                checked={buddyMode === "none"}
                onChange={() => setBuddyMode("none")}
                className="sr-only"
              />
              {t("不需要", "Skip", lang)}
            </label>
            <label className={radioLabelClass(buddyMode === "code")}>
              <input
                type="radio"
                name="buddyMode"
                checked={buddyMode === "code"}
                onChange={() => setBuddyMode("code")}
                className="sr-only"
              />
              {t("輸入或建立同行碼", "Enter or Create Buddy Code", lang)}
            </label>
          </div>

          {/* Buddy code section — animated */}
          <div
            className={`grid transition-[grid-template-rows] duration-300 ease-out ${
              buddyMode === "code" ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
            }`}
          >
            <div className="overflow-hidden px-1 pb-1">
              <div className="space-y-2 pt-1">
                {buddyCodeIsOwn ? (
                  <div className="space-y-1">
                    <BuddyCodeCard
                      code={buddyCode}
                      lang={lang}
                      memberCount={buddyMemberCount}
                      includesSelf
                      subtitle={t(
                        "請將此碼分享給您的朋友，讓他們報名時輸入",
                        "Share this code with your friends to enter when they apply",
                        lang
                      )}
                    />
                    <div className="text-center">
                      <button
                        type="button"
                        onClick={onResetBuddyCode}
                        className="text-xs text-primary/70 hover:text-primary underline"
                      >
                        {t("更改", "Change", lang)}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={buddyCode}
                        onChange={(e) => {
                          setBuddyCode(e.target.value.toUpperCase());
                          setBuddyCodeValid(null);
                        }}
                        onPaste={(e) => {
                          const pasted = e.clipboardData.getData("text").trim().toUpperCase();
                          if (/^BG-[A-Z0-9]{4}$/.test(pasted)) {
                            e.preventDefault();
                            setBuddyCode(pasted);
                            validateBuddyCode(pasted);
                          }
                        }}
                        className={`${inputClass} flex-1`}
                        placeholder="BG-XXXX"
                      />
                      <button
                        type="button"
                        onClick={() => validateBuddyCode(buddyCode)}
                        className={`px-4 py-2.5 text-sm font-medium rounded-xl transition-colors ${
                          buddyCode.trim() && buddyCodeValid === null
                            ? "bg-primary text-primary-foreground hover:bg-primary-hover animate-pulse"
                            : "bg-secondary text-secondary-foreground hover:bg-muted"
                        }`}
                      >
                        {t("驗證", "Verify", lang)}
                      </button>
                    </div>
                    {buddyCodeValid === true && !buddyGroupFull && (
                      <div className="text-xs text-green-600">
                        {t(
                          `同行碼有效（目前 ${buddyMemberCount} 人已加入）`,
                          `Valid code (${buddyMemberCount} member(s) joined)`,
                          lang
                        )}
                      </div>
                    )}
                    {buddyCodeValid === true && buddyGroupFull && (
                      <div className="text-xs text-red-600">
                        {t(
                          `此同行組已滿（最多${buddyMaxMembers}人）。請建立新的同行碼或輸入其他同行碼。`,
                          `This group is full (max ${buddyMaxMembers} members). Please create a new code or enter a different one.`,
                          lang
                        )}
                      </div>
                    )}
                    {buddyCodeValid === false && (
                      <div className="text-xs text-red-600">
                        {t("同行碼無效", "Invalid buddy code", lang)}
                      </div>
                    )}
                    {!(buddyCodeValid === true && !buddyGroupFull) && (
                      <>
                        <div className="text-center text-xs text-muted-foreground">
                          {t("或", "or", lang)}
                        </div>
                        <button
                          type="button"
                          onClick={handleCreateBuddyGroup}
                          className="w-full py-2.5 text-sm font-medium border-2 border-dashed border-primary text-primary rounded-xl hover:bg-primary/10 transition-colors"
                        >
                          {t("建立新的同行碼", "Create a New Buddy Code", lang)}
                        </button>
                      </>
                    )}
                  </>
                )}
                {buddyCodeValid && !buddyCodeIsOwn && !buddyGroupFull && (
                  <div className="pt-2">
                    <label className={labelClass}>
                      {t(
                        "誰將此同行碼分享給您？",
                        "Who shared this code with you?",
                        lang
                      )}
                      <RequiredMark />
                    </label>
                    <input
                      type="text"
                      value={buddyReferrerName}
                      onChange={(e) => setBuddyReferrerName(e.target.value)}
                      className={inputClass}
                      placeholder={t(
                        "請輸入朋友的英文姓名",
                        "Enter your friend's English name",
                        lang
                      )}
                    />
                  </div>
                )}

                {/* Self-declared primary-branch sibling */}
                {buddyJoined && primaryBranches.length > 0 && (
                  <SiblingDeclarationSection
                    lang={lang}
                    declared={declaredSibling}
                    setDeclared={setDeclaredSibling}
                    primaryBranches={primaryBranches}
                    canAdd={!effectiveFull}
                  />
                )}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

interface SiblingDeclarationSectionProps {
  lang: Lang;
  declared: SummerSiblingDeclaration | null;
  setDeclared: (v: SummerSiblingDeclaration | null) => void;
  primaryBranches: { code: string; name_zh: string; name_en: string }[];
  canAdd: boolean;
}

function SiblingDeclarationSection({
  lang,
  declared,
  setDeclared,
  primaryBranches,
  canAdd,
}: SiblingDeclarationSectionProps) {
  if (declared) {
    const branch = primaryBranches.find((b) => b.code === declared.source_branch);
    const branchLabel = branch ? (lang === "zh" ? branch.name_zh : branch.name_en) : declared.source_branch;
    return (
      <div className="pt-3 border-t border-border space-y-2">
        <div className="text-xs font-semibold text-foreground">
          {t("數學思維 / KidsConcept 弟妹", "Younger Sibling at Primary / KidsConcept", lang)}
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-2.5 flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-foreground truncate">{declared.name_en}</div>
            <div className="text-[11px] text-muted-foreground">{branchLabel}</div>
          </div>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium shrink-0">
            {t("待管理員核實", "Pending verification", lang)}
          </span>
          <button
            type="button"
            onClick={() => setDeclared(null)}
            className="p-1 text-muted-foreground hover:text-red-600 shrink-0"
            aria-label={t("移除", "Remove", lang)}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="pt-3 border-t border-border">
      <SiblingInlineForm
        lang={lang}
        primaryBranches={primaryBranches}
        canAdd={canAdd}
        onSubmit={(v) => setDeclared(v)}
      />
    </div>
  );
}

interface SiblingInlineFormProps {
  lang: Lang;
  primaryBranches: { code: string; name_zh: string; name_en: string }[];
  canAdd: boolean;
  onSubmit: (v: SummerSiblingDeclaration) => void;
}

function SiblingInlineForm({ lang, primaryBranches, canAdd, onSubmit }: SiblingInlineFormProps) {
  const [open, setOpen] = useState(false);
  const [nameEn, setNameEn] = useState("");
  const [branch, setBranch] = useState("");
  if (!open) {
    return (
      <button
        type="button"
        disabled={!canAdd}
        onClick={() => setOpen(true)}
        className="w-full py-2 text-xs font-medium border border-dashed border-amber-400 text-amber-800 rounded-xl hover:bg-amber-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5"
      >
        <Plus className="h-3.5 w-3.5" />
        {t(
          "登記正報讀數學思維 / KidsConcept 的弟妹",
          "Add a younger sibling applying to Primary / KidsConcept",
          lang
        )}
      </button>
    );
  }
  const canSave = nameEn.trim().length > 0 && branch.length > 0;
  const reset = () => {
    setOpen(false);
    setNameEn("");
    setBranch("");
  };
  return (
    <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/40 p-2.5">
      <div className="text-xs font-semibold text-foreground">
        {t("數學思維 / KidsConcept 弟妹", "Younger Sibling at Primary / KidsConcept", lang)}
      </div>
      <input
        type="text"
        value={nameEn}
        onChange={(e) => setNameEn(e.target.value)}
        placeholder={t("弟妹英文姓名", "Younger sibling's English name", lang)}
        className={inputClass}
      />
      <div className="text-[11px] text-muted-foreground">
        {t("正報讀的分校", "Applying at branch", lang)}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {primaryBranches.map((b) => {
          const selected = branch === b.code;
          return (
            <button
              key={b.code}
              type="button"
              onClick={() => setBranch(b.code)}
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
          onClick={reset}
          className="text-[11px] text-muted-foreground hover:text-foreground px-2 py-1"
        >
          {t("取消", "Cancel", lang)}
        </button>
        <button
          type="button"
          disabled={!canSave}
          onClick={() => {
            onSubmit({
              name_en: nameEn.trim(),
              source_branch: branch,
            });
            reset();
          }}
          className="text-[11px] font-medium px-3 py-1 rounded-lg bg-primary text-primary-foreground disabled:opacity-50"
        >
          {t("加入", "Add", lang)}
        </button>
      </div>
    </div>
  );
}
