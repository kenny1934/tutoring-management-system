"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Play, Pause } from "lucide-react";
import { cn } from "@/lib/utils";

interface AudioPlayerProps {
  src: string;
  filename?: string;
  className?: string;
}

export default function AudioPlayer({ src, filename, className }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // WebM/Opus audio may report Infinity duration on loadedmetadata;
    // durationchange fires later when the real duration is known.
    const setValidDuration = () => {
      if (isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      }
    };
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onEnded = () => { setIsPlaying(false); setCurrentTime(0); };

    audio.addEventListener("loadedmetadata", setValidDuration);
    audio.addEventListener("durationchange", setValidDuration);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("loadedmetadata", setValidDuration);
      audio.removeEventListener("durationchange", setValidDuration);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("ended", onEnded);
    };
  }, []);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play();
      setIsPlaying(true);
    }
  }, [isPlaying]);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    audio.currentTime = percent * duration;
    setCurrentTime(audio.currentTime);
  }, [duration]);

  const formatTime = (s: number) => {
    if (!isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className={cn("flex items-center gap-2 p-2 rounded-lg bg-[#f5ede3]/60 dark:bg-[#3d3628]/60 min-w-[200px] max-w-[280px]", className)}>
      <audio ref={audioRef} src={src} preload="metadata" />

      <button
        type="button"
        onClick={togglePlay}
        className="flex-shrink-0 w-8 h-8 rounded-full bg-[#a0704b] hover:bg-[#8b5f3c] text-white flex items-center justify-center transition-colors"
      >
        {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 ml-0.5" />}
      </button>

      <div className="flex-1 min-w-0">
        {/* Waveform-style progress bar */}
        <div
          className="h-6 flex items-center gap-[2px] cursor-pointer"
          onClick={handleSeek}
        >
          {Array.from({ length: 30 }, (_, i) => {
            const barProgress = (i / 30) * 100;
            const isPast = barProgress <= progress;
            // Generate pseudo-random heights for waveform look
            const height = 4 + Math.abs(Math.sin(i * 0.7 + 1.5) * 16);
            return (
              <div
                key={i}
                className={cn(
                  "w-[3px] rounded-full transition-colors",
                  isPast ? "bg-[#a0704b]" : "bg-gray-300 dark:bg-gray-600"
                )}
                style={{ height: `${height}px` }}
              />
            );
          })}
        </div>
        <div className="flex justify-between text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
    </div>
  );
}
