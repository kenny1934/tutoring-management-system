import { type Lang, t } from "@/lib/summer-utils";

const STEP_LABELS = [
  { zh: "學生資料", en: "Student" },
  { zh: "學生背景", en: "Background" },
  { zh: "課堂安排", en: "Schedule" },
  { zh: "聯絡方式", en: "Contact" },
  { zh: "確認提交", en: "Confirm" },
];

export type StepStatus = "complete" | "warning" | "default";

interface FormProgressBarProps {
  currentStep: number;
  totalSteps: number;
  lang: Lang;
  stepStatuses: StepStatus[];
  onLangToggle: () => void;
  onStepClick: (step: number) => void;
}

export function FormProgressBar({
  currentStep,
  totalSteps,
  lang,
  stepStatuses,
  onLangToggle,
  onStepClick,
}: FormProgressBarProps) {
  return (
    <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm py-3 -mx-4 px-4 sm:-mx-8 sm:px-8 border-b border-border-subtle">
      <div className="flex items-center gap-1">
        <div className="flex-1 flex items-center">
          {Array.from({ length: totalSteps }, (_, i) => {
            const step = i + 1;
            const isCurrent = step === currentStep;
            const status = stepStatuses[i];
            const label = STEP_LABELS[i];

            // Circle style based on status
            let circleClass: string;
            let content: React.ReactNode;
            if (isCurrent) {
              circleClass =
                "bg-primary text-primary-foreground ring-2 ring-primary/30 ring-offset-2 ring-offset-background";
              content = status === "complete" ? "✓" : step;
            } else if (status === "complete") {
              circleClass =
                "bg-primary text-primary-foreground hover:ring-2 hover:ring-primary/30 hover:ring-offset-2 hover:ring-offset-background";
              content = "✓";
            } else if (status === "warning") {
              circleClass =
                "bg-amber-500 text-white hover:ring-2 hover:ring-amber-300/30 hover:ring-offset-2 hover:ring-offset-background";
              content = "!";
            } else {
              circleClass =
                "bg-secondary text-muted-foreground border border-border hover:border-primary/50";
              content = step;
            }

            // Label style
            let labelClass: string;
            if (isCurrent) {
              labelClass = "text-primary font-medium";
            } else if (status === "complete") {
              labelClass = "text-primary/70";
            } else if (status === "warning") {
              labelClass = "text-amber-600 font-medium";
            } else {
              labelClass = "text-muted-foreground";
            }

            // Connector line: primary if this step is complete
            const lineClass =
              status === "complete" ? "bg-primary" : "bg-border";

            return (
              <div
                key={step}
                className="flex items-center flex-1 last:flex-none"
              >
                <div className="flex flex-col items-center">
                  <button
                    type="button"
                    onClick={() => onStepClick(step)}
                    className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 cursor-pointer ${circleClass}`}
                  >
                    {content}
                  </button>
                  {label && (
                    <span
                      className={`hidden sm:block text-[10px] mt-1 transition-colors duration-300 ${labelClass}`}
                    >
                      {t(label.zh, label.en, lang)}
                    </span>
                  )}
                </div>
                {step < totalSteps && (
                  <div
                    className={`flex-1 h-0.5 mx-1.5 sm:mx-2 rounded-full transition-colors duration-300 ${lineClass}`}
                  />
                )}
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onLangToggle}
          className="ml-3 text-xs sm:text-sm text-primary hover:text-primary-hover font-medium shrink-0"
        >
          {lang === "zh" ? "EN" : "中文"}
        </button>
      </div>
    </div>
  );
}
