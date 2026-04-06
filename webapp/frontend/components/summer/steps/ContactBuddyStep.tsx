import { Smartphone, Phone, BadgePercent } from "lucide-react";
import type { SummerCourseFormConfig } from "@/types";
import {
  type Lang,
  t,
  inputClass,
  sectionClass,
  labelClass,
  radioGroupClass,
  radioLabelClass,
  RadioCheck,
  RequiredMark,
  IconLabel,
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
}: ContactBuddyStepProps) {
  // Current group-discount amount, aware of the early bird deadline.
  // Before the deadline the early-bird group discount applies; after, the
  // regular group discount does. Either way we show the full value of the
  // buddy discount in effect right now.
  const discounts = config?.pricing_config?.discounts || [];
  const ebGroup = discounts.find(
    (d) =>
      (d.conditions?.min_group_size ?? 0) >= 3 && !!d.conditions?.before_date
  );
  const regularGroup = discounts.find(
    (d) =>
      (d.conditions?.min_group_size ?? 0) >= 3 && !d.conditions?.before_date
  );
  const ebDeadline = ebGroup?.conditions?.before_date
    ? new Date(ebGroup.conditions.before_date)
    : null;
  const ebActive = ebDeadline ? ebDeadline > new Date() : false;
  const groupSavings = ebActive && ebGroup
    ? ebGroup.amount
    : regularGroup?.amount ?? null;

  return (
    <div className="space-y-6">
      {/* Contact */}
      <div className={sectionClass}>
        <div>
          <label className={labelClass}>
            <IconLabel icon={Smartphone}>
              {t(
                config?.text_content?.wechat_prompt_zh || "我們會在微信給您發放上課的信息，請提供微信號。",
                config?.text_content?.wechat_prompt_en || "We will send you the class information via WeChat. Please provide your WeChat ID.",
                lang
              )}
            </IconLabel>
            <RequiredMark />
          </label>
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
              {t(
                config?.text_content?.phone_prompt_zh || "請留下聯絡電話，以便我們和您聯絡！",
                config?.text_content?.phone_prompt_en || "Please provide a contact phone number.",
                lang
              )}
            </IconLabel>
            <RequiredMark />
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
              {buddyMode === "none" && <RadioCheck />}
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
              {buddyMode === "code" && <RadioCheck />}
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
                        "請將此碼分享給你的朋友，讓他們報名時輸入",
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
                {buddyCodeValid && !buddyCodeIsOwn && !buddyGroupFull && (
                  <div className="pt-2">
                    <label className={labelClass}>
                      {t(
                        "誰將此同行碼分享給你？",
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
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
