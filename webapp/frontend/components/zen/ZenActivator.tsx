"use client";

import { useState, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useZen } from "@/contexts/ZenContext";
import { useKonamiCode } from "./hooks/useKonamiCode";
import { ZenBootSequence } from "./ZenBootSequence";

/**
 * ZenActivator listens for Konami code globally and handles mode transitions.
 * Place this in the root Providers to enable easter egg activation.
 */
export function ZenActivator() {
  const router = useRouter();
  const pathname = usePathname();
  const { enabled, enableZenMode, disableZenMode } = useZen();
  const [showBootSequence, setShowBootSequence] = useState(false);
  const [bootMode, setBootMode] = useState<"enter" | "exit">("enter");

  const isInZenMode = pathname.startsWith("/zen");

  const handleKonamiActivation = useCallback(() => {
    if (enabled || isInZenMode) {
      // Already in zen mode - toggle off
      setBootMode("exit");
      setShowBootSequence(true);
    } else {
      // Activate zen mode
      setBootMode("enter");
      setShowBootSequence(true);
    }
  }, [enabled, isInZenMode]);

  const handleBootComplete = useCallback(() => {
    setShowBootSequence(false);
    if (bootMode === "enter") {
      enableZenMode();
      router.push("/zen");
    } else {
      disableZenMode();
      // Navigate to equivalent GUI route
      if (pathname.startsWith("/zen/students")) {
        router.push("/students");
      } else if (pathname.startsWith("/zen/sessions")) {
        router.push("/sessions");
      } else if (pathname.startsWith("/zen/courseware")) {
        router.push("/courseware");
      } else if (pathname.startsWith("/zen/revenue")) {
        router.push("/revenue");
      } else if (pathname.startsWith("/zen/settings")) {
        router.push("/settings");
      } else {
        router.push("/");
      }
    }
  }, [bootMode, enableZenMode, disableZenMode, router, pathname]);

  // Listen for Konami code
  useKonamiCode({
    onActivate: handleKonamiActivation,
    enabled: true,
  });

  if (showBootSequence) {
    return <ZenBootSequence mode={bootMode} onComplete={handleBootComplete} />;
  }

  return null;
}
