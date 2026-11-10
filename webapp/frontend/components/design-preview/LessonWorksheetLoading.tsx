"use client";

import { useEffect, useState, type ReactNode } from "react";
import { FileWarning, Loader2, RefreshCw } from "lucide-react";
import styles from "./NativePreview.module.css";

/** Give the tutor a useful stage without exposing search queries or drive paths. */
function progressMessage(message?: string | null) {
  if (message?.startsWith("Downloading")) return "Downloading worksheet";
  if (message?.startsWith("Preparing") || message?.startsWith("Rendering")) return "Preparing pages";
  if (message?.startsWith("Composing")) return "Preparing both language versions";
  if (message?.startsWith("Loading both")) return "Loading both language versions";
  if (message?.startsWith("Reading") || message?.startsWith("Trying local")) return "Opening worksheet";
  return message ? "Finding worksheet in Shelv" : "Loading worksheet";
}

/** The selected file and the way out of focus stay in place through loading and retry. */
export function LessonWorksheetLoading({ label, pages, toolbarStart, toolbarClass, message, error, onRetry }: {
  label?: string; pages?: string; toolbarStart?: ReactNode; toolbarClass: string;
  message?: string | null; error?: string | null; onRetry?: () => void;
}) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (error) return;
    const reveal = setTimeout(() => setElapsed(1), 180);
    const slow = setTimeout(() => setElapsed(2), 8000);
    return () => { clearTimeout(reveal); clearTimeout(slow); };
  }, [error]);
  const stage = progressMessage(message);
  return <div data-native-worksheet-loading={!error || undefined} data-native-pdf-failed={error ? "" : undefined} className={styles.worksheetLoading} aria-busy={!error}>
    <div className={toolbarClass}>
      {toolbarStart}
      {label && <span className={styles.worksheetLoadingLabel} title={label}>{label}</span>}
      {pages && <span className={styles.worksheetLoadingPages}>p{pages}</span>}
    </div>
    <div className={styles.worksheetLoadingDesk}>
      <div className={styles.worksheetLoadingPaper} data-pending={!error && elapsed === 0 || undefined}>
        <div className={styles.worksheetProgress}>
          <span role={error ? "alert" : "status"} aria-live="polite" aria-atomic="true">
            {error ? <FileWarning size={18} aria-hidden="true" /> : <Loader2 size={16} aria-hidden="true" className={styles.worksheetSpinner} />}
            {error || `${elapsed === 2 ? "Still " + stage[0].toLowerCase() + stage.slice(1) : stage}…`}
          </span>
          {error && onRetry && <button type="button" onClick={onRetry} className={styles.worksheetRetry}><RefreshCw size={15} aria-hidden="true" />Try again</button>}
        </div>
      </div>
    </div>
  </div>;
}
