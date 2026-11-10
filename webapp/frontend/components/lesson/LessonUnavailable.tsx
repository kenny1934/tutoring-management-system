"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { IconButton } from "@/components/controls";
import { cancelLessonFrameNavigation, closeLessonFrame, connectLessonFrame, dismissLessonOverlay } from "@/components/design-preview/lessonFrame";
import styles from "@/components/design-preview/NativePreview.module.css";

/** Empty and unavailable lessons still complete the opening handshake and can be left. */
export function LessonUnavailable({ slot, message, returnHref, children }: {
  slot: string | null; message: string; returnHref: string; children?: ReactNode;
}) {
  const router = useRouter();
  const stage = useRef<HTMLDivElement>(null);
  const leave = useCallback(() => {
    if (!closeLessonFrame()) router.push(returnHref);
  }, [returnHref, router]);
  const frameExit = useCallback(() => {
    if (dismissLessonOverlay()) { cancelLessonFrameNavigation(); return; }
    leave();
  }, [leave]);
  useEffect(() => connectLessonFrame(frameExit, stage.current, frameExit), [frameExit]);

  return <div ref={stage} data-native-preview="motion" data-native-wide-lesson className={`flex flex-col flex-1 min-h-0 relative ${styles.lessonStage}`}>
    <header data-native-lesson-header className="flex items-center gap-2 px-3 py-2 border-b border-white/10">
      <IconButton icon={ArrowLeft} label="Exit lesson mode" onClick={leave} className="text-white/80 hover:bg-white/10" />
      <span className="text-sm font-semibold text-white/80">{slot || "Lesson mode"}</span>
    </header>
    <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
      <AlertTriangle className="h-10 w-10 text-amber-400" aria-hidden="true" />
      <p role="status" className="text-sm text-white/80">{message}</p>
      {children}
    </div>
  </div>;
}
