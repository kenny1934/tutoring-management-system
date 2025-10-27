/**
 * CSM Pro Design System
 * Export all design system components and utilities
 */

// Animation variants
export * from "./animations/variants";

// Components
export { AnimatedButton } from "./components/AnimatedButton";
export { GlassCard } from "./components/GlassCard";
export { PageTransition } from "./components/PageTransition";

// Education Components (Skeuomorphic Classroom Objects)
export {
  // Paper & Note Components
  StickyNote,
  FlashCard,
  CompositionNotebook,
  // Math & Academic Components
  GraphPaper,
  EngineeringPaper,
  WorksheetCard,
  WorksheetProblem,
  AnswerBlank,
  ReportCard,
  Subject,
  TeacherComment,
  CalculatorDisplay,
  Certificate,
  // Organization Components
  FileFolder,
  IndexCard,
  BinderTabs,
  BinderTab,
  GradeBookHeader,
  StudentCard,
  // Interactive & Feedback Components
  Highlighter,
  RubberStamp,
  DateStamp,
  GradeStamp,
  StatusStamp,
  StickerBadge,
  StickerGrid,
  HandwrittenNote,
  CircleAnnotation,
  UnderlineAnnotation,
} from "./components/education";
