"use client";

import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { toEmbedUrl } from "@/lib/exercise-utils";

interface UrlExerciseViewProps {
  /** The exercise's link. */
  url: string;
  /** The exercise's name, which the embedded frame is titled with. */
  title: string;
  isMobile: boolean;
  /**
   * Buttons for a bar above the link. A link has no viewer toolbar, so the
   * one-student view puts focus mode's way back here. The multi-student view
   * has it in the student strip instead.
   */
  toolbarStart?: ReactNode;
}

/**
 * An exercise that's a link, not a PDF. A link the lesson can embed, such as
 * a video or a shared Google Doc, shows in a frame. Anything else gets a
 * button to open it in a new tab.
 */
export function UrlExerciseView({ url, title, isMobile, toolbarStart }: UrlExerciseViewProps) {
  const embedUrl = toEmbedUrl(url);
  const isGoogleDoc = url.includes("docs.google.com");

  return (
    <div className={cn("flex-1 flex flex-col min-h-0 bg-[#e8dcc8] dark:bg-[#1e1a14]", isMobile && "pb-20")}>
      {toolbarStart && (
        <div className="flex items-center gap-1 px-2 py-0.5 border-b border-[#d4c4a8] dark:border-[#3a3228] bg-[#f0e6d4] dark:bg-[#252018]">
          {toolbarStart}
        </div>
      )}
      {embedUrl ? (
        <>
          <iframe
            src={embedUrl}
            className="w-full border-0 rounded"
            style={{ flex: 1, minHeight: 0 }}
            allow="autoplay; fullscreen"
            allowFullScreen
            title={title}
          />
          {(isMobile || isGoogleDoc) && (
            <div className="flex items-center justify-center gap-3 py-1.5 text-xs flex-shrink-0">
              {isMobile && (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  Open in app
                </a>
              )}
              {isGoogleDoc && (
                <span className="text-[#8b7355] dark:text-[#a09080]">
                  {"Can't see the file? Ask the owner to share it with you."}
                </span>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <p className="text-sm text-[#8b7355] dark:text-[#a09080]">
            This resource cannot be embedded directly.
          </p>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            Open in new tab
          </a>
        </div>
      )}
    </div>
  );
}
