"use client";

import { useState, useRef, useEffect } from "react";
import { Copy, Check, Share2 } from "lucide-react";
import { type Lang, t } from "@/lib/summer-utils";

interface BuddyCodeCardProps {
  code: string;
  lang: Lang;
  memberCount?: number | null;
  /** Text shown below the code when memberCount is 0 or null */
  subtitle?: string;
  /** Visual variant */
  variant?: "primary" | "amber";
}

function getShareMessage(code: string, lang: Lang): string {
  return lang === "zh"
    ? `我已申請報讀MathConcept中學教室的暑期課程！用我的同行碼報名可以一同享受優惠：${code}`
    : `I've applied for the MathConcept Secondary Academy summer course! Use my buddy code to enjoy a group discount: ${code}`;
}

export function BuddyCodeCard({
  code,
  lang,
  memberCount,
  subtitle,
  variant = "primary",
}: BuddyCodeCardProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const flashCopied = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setCopied(true);
    timerRef.current = setTimeout(() => setCopied(false), 2000);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      flashCopied();
    } catch {
      // clipboard API denied — no fallback needed for modern mobile browsers
    }
  };

  const handleShare = async () => {
    const message = getShareMessage(code, lang);
    if (navigator.share) {
      try {
        await navigator.share({ text: message });
      } catch {
        // User cancelled — do nothing
      }
    } else {
      // No Web Share API (desktop) — copy the full message
      try {
        await navigator.clipboard.writeText(message);
        flashCopied();
      } catch {
        // clipboard API denied
      }
    }
  };

  const isPrimary = variant === "primary";
  const borderClass = isPrimary ? "border-primary bg-primary/5" : "border-amber-300 bg-amber-50";
  const codeClass = isPrimary ? "text-primary" : "text-amber-700";

  return (
    <div className={`rounded-xl border-2 ${borderClass} p-3 text-center space-y-2`}>
      <div className="text-xs text-muted-foreground">
        {t("同行碼", "Buddy Code", lang)}
      </div>
      <div className={`text-lg font-mono font-bold ${codeClass}`}>
        {code}
      </div>
      {memberCount != null && memberCount > 0 ? (
        <div className="text-xs text-muted-foreground">
          {t(`已有 ${memberCount} 人加入`, `${memberCount} member(s) joined`, lang)}
        </div>
      ) : subtitle ? (
        <div className="text-xs text-muted-foreground">{subtitle}</div>
      ) : null}
      <div className="flex items-center justify-center gap-2 pt-1">
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-card hover:bg-muted transition-colors"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-green-600" />
              {t("已複製", "Copied", lang)}
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              {t("複製", "Copy", lang)}
            </>
          )}
        </button>
        <button
          type="button"
          onClick={handleShare}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-card hover:bg-muted transition-colors"
        >
          <Share2 className="h-3.5 w-3.5" />
          {t("分享", "Share", lang)}
        </button>
      </div>
    </div>
  );
}
