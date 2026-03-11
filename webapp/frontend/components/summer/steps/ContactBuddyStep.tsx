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
} from "@/lib/summer-utils";

interface ContactBuddyStepProps {
  lang: Lang;
  wechatId: string;
  setWechatId: (v: string) => void;
  contactPhone: string;
  setContactPhone: (v: string) => void;
  buddyMode: "none" | "code" | "names";
  setBuddyMode: (v: "none" | "code" | "names") => void;
  buddyCode: string;
  setBuddyCode: (v: string) => void;
  buddyNames: string;
  setBuddyNames: (v: string) => void;
  buddyCodeValid: boolean | null;
  setBuddyCodeValid: (v: boolean | null) => void;
  buddyMemberCount: number | null;
  validateBuddyCode: (code: string) => void;
  handleCreateBuddyGroup: () => void;
}

export function ContactBuddyStep({
  lang,
  wechatId,
  setWechatId,
  contactPhone,
  setContactPhone,
  buddyMode,
  setBuddyMode,
  buddyCode,
  setBuddyCode,
  buddyNames,
  setBuddyNames,
  buddyCodeValid,
  setBuddyCodeValid,
  buddyMemberCount,
  validateBuddyCode,
  handleCreateBuddyGroup,
}: ContactBuddyStepProps) {
  return (
    <div className="space-y-6">
      {/* Contact */}
      <div className={sectionClass}>
        <div>
          <label className={labelClass}>
            {t(
              "\u{1F4F2} 我們會在微信給您發放上課的信息，請提供微信號。",
              "\u{1F4F2} We will send you the class information via WeChat. Please provide your WeChat ID.",
              lang
            )}
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
            {t(
              "\u{1F4DE} 請留下聯絡電話，以便我們和您聯絡！",
              "\u{1F4DE} Please also kindly leave your contact number.",
              lang
            )}
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
        <h2 className="text-base font-semibold text-foreground leading-snug">
          {t("同行優惠", "Buddy Group Discount", lang)}
        </h2>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {t(
            "三人或以上同行報名可享團報優惠。你可以輸入同行碼加入已有的小組，或建立新的同行碼分享給朋友。",
            "Groups of 3 or more get a group discount. Enter a buddy code to join an existing group, or create a new code to share with friends.",
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
              {t("輸入同行碼", "Enter Buddy Code", lang)}
            </label>
            <label className={radioLabelClass(buddyMode === "names")}>
              <input
                type="radio"
                name="buddyMode"
                checked={buddyMode === "names"}
                onChange={() => setBuddyMode("names")}
                className="sr-only"
              />
              {buddyMode === "names" && <RadioCheck />}
              {t("填寫朋友姓名", "Enter Friends' Names", lang)}
            </label>
          </div>

          {/* Buddy code section — animated */}
          <div
            className={`grid transition-[grid-template-rows] duration-300 ease-out ${
              buddyMode === "code" ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
            }`}
          >
            <div className="overflow-hidden">
              <div className="space-y-2 pt-1">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={buddyCode}
                    onChange={(e) => {
                      setBuddyCode(e.target.value.toUpperCase());
                      setBuddyCodeValid(null);
                    }}
                    className={`${inputClass} flex-1`}
                    placeholder="BG-XXXX"
                  />
                  <button
                    type="button"
                    onClick={() => validateBuddyCode(buddyCode)}
                    className="px-4 py-2.5 text-sm font-medium bg-secondary text-secondary-foreground rounded-xl hover:bg-muted transition-colors"
                  >
                    {t("驗證", "Verify", lang)}
                  </button>
                </div>
                {buddyCodeValid === true && (
                  <div className="text-xs text-green-600">
                    {t(
                      `同行碼有效（目前 ${buddyMemberCount} 人已加入）`,
                      `Valid code (${buddyMemberCount} member(s) joined)`,
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
              </div>
            </div>
          </div>

          {/* Buddy names section — animated */}
          <div
            className={`grid transition-[grid-template-rows] duration-300 ease-out ${
              buddyMode === "names" ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
            }`}
          >
            <div className="overflow-hidden">
              <div className="pt-1">
                <label className={labelClass}>
                  {t("朋友姓名", "Friends' Names", lang)}
                </label>
                <textarea
                  value={buddyNames}
                  onChange={(e) => setBuddyNames(e.target.value)}
                  rows={2}
                  className={inputClass}
                  placeholder={t(
                    "請填寫你同行朋友的英文姓名",
                    "Enter your friends' English names",
                    lang
                  )}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
