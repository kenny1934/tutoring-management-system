"use client";

import { useEffect } from "react";
import { Megaphone, Tag, Bug, Zap, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { PageTransition } from "@/lib/design-system";
import { usePageTitle, markVersionSeen } from "@/lib/hooks";
import changelogData from "@/lib/changelog-data";

interface ChangelogItem {
  description: string;
}

interface ChangelogSection {
  title: string;
  items: ChangelogItem[];
}

interface ChangelogRelease {
  version: string;
  date: string;
  sections: ChangelogSection[];
}

const releases = changelogData as ChangelogRelease[];

/** Render basic markdown (bold, code, links) in changelog descriptions. */
function renderMarkdown(text: string) {
  // Split on **bold**, `code`, and [text](url) patterns, preserving delimiters
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g);
  return parts.filter(Boolean).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="font-semibold text-foreground/90">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={i} className="px-1 py-0.5 rounded bg-foreground/5 text-xs font-mono">{part.slice(1, -1)}</code>;
    }
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      return <a key={i} href={linkMatch[2]} className="underline text-primary">{linkMatch[1]}</a>;
    }
    return part;
  });
}

const sectionIcons: Record<string, typeof Megaphone> = {
  "New Features": Megaphone,
  "Bug Fixes": Bug,
  "Performance": Zap,
  "Improvements": Wrench,
};

const sectionColors: Record<string, string> = {
  "New Features": "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
  "Bug Fixes": "text-red-600 dark:text-red-400 bg-red-500/10",
  "Performance": "text-amber-600 dark:text-amber-400 bg-amber-500/10",
  "Improvements": "text-blue-600 dark:text-blue-400 bg-blue-500/10",
};

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00Z");
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default function WhatsNewPage() {
  usePageTitle("What's New");

  // Mark current version as seen (clears blue dot in Sidebar immediately)
  useEffect(() => {
    markVersionSeen();
  }, []);

  return (
    <DeskSurface>
      <PageTransition className="flex flex-col gap-4 sm:gap-6 p-4 sm:p-8 max-w-[48rem] mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 rounded-2xl p-4 sm:p-5 backdrop-blur-sm bg-[rgba(245,240,232,0.6)] dark:bg-[rgba(42,42,42,0.3)] border border-white/20 dark:border-white/10">
          <div className="p-3 rounded-xl bg-[#f5f0e8] dark:bg-[#2d2618]">
            <Megaphone className="h-6 w-6 text-foreground/60" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">What&apos;s New</h1>
            <p className="text-sm text-foreground/60">Latest updates and improvements</p>
          </div>
        </div>

        {/* Release list */}
        {releases.length === 0 ? (
          <div className="text-center py-12 text-foreground/50">
            <Megaphone className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>No releases yet. Check back soon!</p>
          </div>
        ) : (
          <div className="space-y-6">
            {releases.map((release, idx) => (
              <div
                key={release.version}
                className={cn(
                  "rounded-2xl border p-5 sm:p-6 backdrop-blur-sm",
                  "bg-[rgba(245,240,232,0.5)] dark:bg-[rgba(42,42,42,0.3)]",
                  "border-white/20 dark:border-white/10",
                  idx === 0 && "ring-1 ring-primary/20"
                )}
              >
                {/* Release header */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex items-center gap-2">
                    <Tag className="h-4 w-4 text-foreground/40" />
                    <span className="text-lg font-bold text-foreground">
                      v{release.version}
                    </span>
                  </div>
                  {idx === 0 && (
                    <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-primary/10 text-primary">
                      Latest
                    </span>
                  )}
                  <span className="ml-auto text-xs text-foreground/40">
                    {formatDate(release.date)}
                  </span>
                </div>

                {/* Sections */}
                <div className="space-y-4">
                  {release.sections.map((section) => {
                    const Icon = sectionIcons[section.title] || Megaphone;
                    const colorClass = sectionColors[section.title] || "text-foreground/60 bg-foreground/5";

                    return (
                      <div key={section.title}>
                        <div className="flex items-center gap-2 mb-2">
                          <div className={cn("p-1 rounded-md", colorClass)}>
                            <Icon className="h-3.5 w-3.5" />
                          </div>
                          <h3 className="text-sm font-semibold text-foreground/80">
                            {section.title}
                          </h3>
                        </div>
                        <ul className="space-y-1.5 ml-7">
                          {section.items.map((item, i) => (
                            <li
                              key={i}
                              className="text-sm text-foreground/70 flex items-start gap-2"
                            >
                              <span className="mt-2 h-1 w-1 rounded-full bg-foreground/30 flex-shrink-0" />
                              <span>{renderMarkdown(item.description)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </PageTransition>
    </DeskSurface>
  );
}
