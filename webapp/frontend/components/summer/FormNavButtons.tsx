import { type Lang, t } from "@/lib/summer-utils";

interface FormNavButtonsProps {
  currentStep: number;
  totalSteps: number;
  submitting: boolean;
  confirmed: boolean;
  lang: Lang;
  onNext: () => void;
  onPrev: () => void;
  errors: string[];
}

export function FormNavButtons({
  currentStep,
  totalSteps,
  submitting,
  confirmed,
  lang,
  onNext,
  onPrev,
  errors,
}: FormNavButtonsProps) {
  const isLastStep = currentStep === totalSteps;

  return (
    <div className="pt-6 space-y-3">
      {errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-1">
          {errors.map((err) => (
            <div key={err} className="text-sm text-red-700">
              {err}
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-3">
        {currentStep > 1 && (
          <button
            type="button"
            onClick={onPrev}
            className="flex-1 py-3 rounded-xl font-semibold border-2 border-border text-foreground hover:bg-secondary transition-colors"
          >
            {t("上一步", "Previous", lang)}
          </button>
        )}
        {!isLastStep ? (
          <button
            key="nav-next"
            type="button"
            onClick={onNext}
            className="flex-1 py-3 rounded-xl font-semibold text-primary-foreground bg-primary hover:bg-primary-hover transition-colors"
          >
            {t("下一步", "Next", lang)}
          </button>
        ) : (
          <button
            key="nav-submit"
            type="submit"
            disabled={submitting || !confirmed}
            className="flex-1 py-3 rounded-xl font-semibold text-primary-foreground bg-primary hover:bg-primary-hover disabled:bg-muted disabled:cursor-not-allowed transition-colors"
          >
            {submitting
              ? t("提交中...", "Submitting...", lang)
              : t("提交報名", "Submit Application", lang)}
          </button>
        )}
      </div>
    </div>
  );
}
