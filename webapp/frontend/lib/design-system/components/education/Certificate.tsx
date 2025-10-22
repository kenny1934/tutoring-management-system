"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface CertificateProps {
  /**
   * Certificate title/heading
   * @default "Certificate of Achievement"
   */
  title?: string;

  /**
   * Recipient name
   */
  recipientName: string;

  /**
   * Achievement description
   */
  achievement: string;

  /**
   * Award date
   */
  date: string;

  /**
   * Signatory name
   * @default "CSM Pro Math Center"
   */
  signedBy?: string;

  /**
   * Certificate variant/tier
   * @default "gold"
   */
  variant?: "gold" | "silver" | "bronze";

  /**
   * Show decorative seal
   * @default true
   */
  showSeal?: boolean;

  /**
   * Additional content (optional custom elements)
   */
  children?: ReactNode;

  /**
   * Additional CSS classes
   */
  className?: string;
}

/**
 * Certificate - Formal achievement certificate component
 *
 * Creates traditional achievement certificates with decorative borders,
 * ribbon seals, and formal typography. Perfect for course completions,
 * milestones, and recognition awards.
 *
 * @example
 * ```tsx
 * <Certificate
 *   title="Certificate of Excellence"
 *   recipientName="Jane Smith"
 *   achievement="Mastery of Quadratic Equations"
 *   date="October 19, 2025"
 *   variant="gold"
 *   showSeal={true}
 * />
 * ```
 */
export function Certificate({
  title = "Certificate of Achievement",
  recipientName,
  achievement,
  date,
  signedBy = "CSM Pro Math Center",
  variant = "gold",
  showSeal = true,
  children,
  className,
}: CertificateProps) {
  const variantStyles = getVariantStyles(variant);

  return (
    <div
      className={cn(
        "relative w-full",
        "bg-[#fef9f3] dark:bg-[#2d2618]",
        "paper-texture rounded-sm p-12",
        "border-8 border-double",
        variantStyles.border,
        className
      )}
    >
      {/* Decorative corner flourishes */}
      <div className="absolute top-4 left-4 text-4xl opacity-20">❦</div>
      <div className="absolute top-4 right-4 text-4xl opacity-20">❦</div>
      <div className="absolute bottom-4 left-4 text-4xl opacity-20">❦</div>
      <div className="absolute bottom-4 right-4 text-4xl opacity-20">❦</div>

      {/* Decorative inner border */}
      <div className={cn("absolute inset-8 border-2 rounded-sm", variantStyles.innerBorder)} />

      {/* Content */}
      <div className="relative z-10 text-center space-y-6">
        {/* Title with foil effect */}
        <h1
          className={cn(
            "text-5xl font-serif font-bold tracking-wide",
            variantStyles.titleGradient,
            "bg-clip-text text-transparent"
          )}
        >
          {title}
        </h1>

        {/* Formal statement */}
        <p className="text-lg italic text-gray-800 dark:text-gray-300 mt-8">
          This certifies that
        </p>

        {/* Recipient name */}
        <h2 className="text-4xl font-serif font-semibold text-gray-900 dark:text-gray-100 border-b-2 border-gray-500 dark:border-gray-600 inline-block px-8 pb-2">
          {recipientName}
        </h2>

        {/* Achievement description */}
        <p className="text-lg text-gray-800 dark:text-gray-300 mt-6">
          has successfully achieved
        </p>

        <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100 px-12">
          {achievement}
        </p>

        {/* Custom content */}
        {children && <div className="mt-6">{children}</div>}

        {/* Date and signature row */}
        <div className="flex justify-between items-end mt-12 px-8">
          {/* Date */}
          <div className="text-left">
            <div className="border-b border-gray-500 dark:border-gray-600 pb-1 min-w-[200px] text-center mb-2 text-gray-900 dark:text-gray-100">
              {date}
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-400">Date</p>
          </div>

          {/* Signature */}
          <div className="text-right">
            <div className="border-b border-gray-500 dark:border-gray-600 pb-1 min-w-[250px] text-center mb-2">
              <span className="font-serif italic text-xl text-gray-900 dark:text-gray-100">{signedBy}</span>
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-400">Authorized Signature</p>
          </div>
        </div>
      </div>

      {/* Ribbon seal */}
      {showSeal && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
          <RibbonSeal variant={variant} />
        </div>
      )}
    </div>
  );
}

interface RibbonSealProps {
  variant: "gold" | "silver" | "bronze";
}

function RibbonSeal({ variant }: RibbonSealProps) {
  const sealStyles = getVariantStyles(variant);

  return (
    <div className="relative w-20 h-20">
      {/* Seal circle */}
      <div
        className={cn(
          "absolute inset-0 rounded-full border-4 shadow-lg",
          sealStyles.sealBg,
          sealStyles.border
        )}
      >
        <div className="absolute inset-2 rounded-full border-2 border-white/50 dark:border-gray-900/50" />
      </div>

      {/* Ribbon tails */}
      <div
        className={cn(
          "absolute top-16 left-2 w-6 h-12 clip-ribbon-tail shadow-md",
          sealStyles.sealBg
        )}
      />
      <div
        className={cn(
          "absolute top-16 right-2 w-6 h-12 clip-ribbon-tail shadow-md",
          sealStyles.sealBg
        )}
      />
    </div>
  );
}

function getVariantStyles(variant: "gold" | "silver" | "bronze") {
  switch (variant) {
    case "gold":
      return {
        border: "border-amber-500 dark:border-amber-600",
        innerBorder: "border-amber-400/50 dark:border-amber-500/50",
        titleGradient: "bg-gradient-to-r from-yellow-600 via-amber-500 to-yellow-600",
        sealBg: "bg-gradient-to-br from-yellow-400 via-amber-500 to-yellow-600",
      };
    case "silver":
      return {
        border: "border-gray-400 dark:border-gray-500",
        innerBorder: "border-gray-300/50 dark:border-gray-400/50",
        titleGradient: "bg-gradient-to-r from-gray-400 via-gray-300 to-gray-400",
        sealBg: "bg-gradient-to-br from-gray-300 via-gray-400 to-gray-500",
      };
    case "bronze":
      return {
        border: "border-orange-700 dark:border-orange-800",
        innerBorder: "border-orange-600/50 dark:border-orange-700/50",
        titleGradient: "bg-gradient-to-r from-orange-600 via-amber-700 to-orange-600",
        sealBg: "bg-gradient-to-br from-orange-500 via-amber-600 to-orange-700",
      };
  }
}
