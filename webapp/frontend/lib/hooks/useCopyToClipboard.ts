import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/contexts/ToastContext";

export function useCopyToClipboard(resetMs = 2000) {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const copy = useCallback((value: string) => {
    navigator.clipboard.writeText(value);
    showToast("Copied", "success");
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), resetMs);
  }, [showToast, resetMs]);

  return { copied, copy };
}
