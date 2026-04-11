"use client";

import { useState, useRef, useCallback, useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { getUrlBadge, getYouTubeVideoId } from "@/lib/exercise-utils";

/** Renders a small colored badge for URL exercise type (Slides, Video, Math, Quiz, Link, etc.) */
export function UrlBadge({ url }: { url?: string | null }) {
  const badge = getUrlBadge(url);
  if (!badge) return null;
  return (
    <span className={`ml-1 text-[9px] px-1 rounded ${badge.className}`}>
      {badge.label}
    </span>
  );
}

/**
 * Wraps children and shows a YouTube thumbnail tooltip on hover.
 * Uses portal to escape overflow:hidden containers.
 * Renders nothing extra if URL is not YouTube.
 */
export function YouTubeThumbnail({ url, children, fallbackIcon, className: wrapperClass }: { url?: string | null; children?: ReactNode; fallbackIcon?: ReactNode; className?: string }) {
  const videoId = getYouTubeVideoId(url);
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(null);

  const handleEnter = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const thumbW = 192;
      let left = rect.right + 8;
      if (left + thumbW > window.innerWidth - 8) left = rect.left - thumbW - 8;
      setPos({ top: rect.top, left });
      setShow(true);
    }, 300);
  }, []);

  const handleLeave = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setShow(false);
  }, []);

  useEffect(() => {
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, []);

  // Not a YouTube URL — render fallback icon or children
  if (!videoId) return <>{fallbackIcon || children}</>;

  return (
    <>
      {children}
      <span
        ref={ref}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        className={`inline-flex items-center cursor-pointer flex-shrink-0 ${wrapperClass || ''}`}
        title="Hover for preview"
      >
        <svg className="w-3.5 h-3.5 text-red-500" viewBox="0 0 24 24" fill="currentColor">
          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z" />
          <path d="M9.545 15.568V8.432L15.818 12z" fill="white" />
        </svg>
      </span>
      {show && pos && createPortal(
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{ top: pos.top, left: pos.left, animation: "resource-dropdown-in 100ms ease-out" }}
        >
          <div className="bg-black rounded-md shadow-xl overflow-hidden border border-gray-700">
            <img
              src={`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`}
              alt=""
              className="w-48 h-auto block"
            />
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

/** Inline-style version for contexts that don't use Tailwind (e.g., Zen mode) */
export function UrlBadgeInline({ url }: { url?: string | null }) {
  const badge = getUrlBadge(url);
  if (!badge) return null;
  return (
    <span style={{ fontSize: '9px', padding: '0 3px', borderRadius: '3px', backgroundColor: `${badge.hex}20`, color: badge.hex, flexShrink: 0 }}>
      {badge.label}
    </span>
  );
}
