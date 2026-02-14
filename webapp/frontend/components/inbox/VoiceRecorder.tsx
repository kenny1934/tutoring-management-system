"use client";

import React, { useState, useRef, useCallback } from "react";
import { Mic, Square, Send, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface VoiceRecorderProps {
  onSend: (file: File) => Promise<void>;
  className?: string;
}

export default function VoiceRecorder({ onSend, className }: VoiceRecorderProps) {
  const [state, setState] = useState<"idle" | "recording" | "uploading">("idle");
  const [duration, setDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4",
      });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.start(100); // Collect data every 100ms
      setState("recording");
      setDuration(0);

      timerRef.current = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);
    } catch {
      // Permission denied or no microphone
    }
  }, []);

  const stopAndDiscard = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    chunksRef.current = [];
    setState("idle");
    setDuration(0);
  }, []);

  const stopAndSend = useCallback(async () => {
    if (!mediaRecorderRef.current) return;

    return new Promise<void>((resolve) => {
      mediaRecorderRef.current!.onstop = async () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }

        const mimeType = mediaRecorderRef.current!.mimeType;
        const ext = mimeType.includes("webm") ? "webm" : "mp4";
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const file = new File([blob], `voice-message.${ext}`, { type: mimeType });

        setState("uploading");
        try {
          await onSend(file);
        } finally {
          setState("idle");
          setDuration(0);
          chunksRef.current = [];
        }
        resolve();
      };
      mediaRecorderRef.current!.stop();
    });
  }, [onSend]);

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  if (state === "idle") {
    return (
      <button
        type="button"
        onClick={startRecording}
        className={cn(
          "p-2 rounded-lg text-gray-500 hover:text-[#a0704b] hover:bg-[#f5ede3]/60 dark:hover:bg-[#3d3628]/50 transition-colors",
          className
        )}
        title="Record voice message"
      >
        <Mic className="h-4 w-4" />
      </button>
    );
  }

  if (state === "uploading") {
    return (
      <div className={cn("flex items-center gap-2 px-3 py-1.5", className)}>
        <Loader2 className="h-4 w-4 animate-spin text-[#a0704b]" />
        <span className="text-xs text-gray-500">Sending...</span>
      </div>
    );
  }

  // Recording state
  return (
    <div className={cn("flex items-center gap-2 px-2 py-1", className)}>
      <div className="flex items-center gap-1.5">
        <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
        <span className="text-xs font-mono text-gray-600 dark:text-gray-400 tabular-nums">
          {formatDuration(duration)}
        </span>
      </div>
      <div className="flex-1" />
      <button
        type="button"
        onClick={stopAndDiscard}
        className="p-1.5 rounded-full text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
        title="Discard"
      >
        <X className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={stopAndSend}
        className="p-1.5 rounded-full text-white bg-[#a0704b] hover:bg-[#8b5f3c] transition-colors"
        title="Send voice message"
      >
        <Send className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
