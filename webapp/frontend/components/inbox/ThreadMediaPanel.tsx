"use client";

import { useState, useMemo } from "react";
import { X, FileText, Download, ExternalLink, Play, Image as ImageIcon, File, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import ImageLightbox from "@/components/inbox/ImageLightbox";
import { extractUrls } from "@/components/inbox/LinkPreview";
import type { MessageThread } from "@/types";

type Tab = "media" | "files" | "links";

interface MediaItem {
  type: "image" | "gif" | "video";
  url: string;
  date: string;
  sender: string;
}

interface FileItem {
  url: string;
  filename: string;
  content_type: string;
  date: string;
  sender: string;
}

interface LinkItem {
  url: string;
  domain: string;
  date: string;
  sender: string;
}

function formatMonth(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

interface ThreadMediaPanelProps {
  thread: MessageThread;
  onClose: () => void;
  isMobile: boolean;
}

export default function ThreadMediaPanel({ thread, onClose, isMobile }: ThreadMediaPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>("media");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const allMessages = useMemo(
    () => [thread.root_message, ...thread.replies.filter(r => r.id > 0)],
    [thread]
  );

  // Collect media (images, GIFs, videos)
  const media = useMemo<MediaItem[]>(() => {
    const items: MediaItem[] = [];
    for (const m of allMessages) {
      const sender = m.from_tutor_name || "Unknown";
      for (const url of m.image_attachments || []) {
        items.push({ type: "image", url, date: m.created_at, sender });
      }
      for (const f of m.file_attachments || []) {
        if (f.content_type === "image/gif") {
          items.push({ type: "gif", url: f.url, date: m.created_at, sender });
        } else if (f.content_type?.startsWith("video/")) {
          items.push({ type: "video", url: f.url, date: m.created_at, sender });
        }
      }
    }
    return items.reverse(); // newest first
  }, [allMessages]);

  // Image URLs for lightbox (only images + GIFs, not videos)
  const lightboxUrls = useMemo(() => media.filter(m => m.type !== "video").map(m => m.url), [media]);

  // Collect files (documents — not audio, video, or GIF)
  const files = useMemo<FileItem[]>(() => {
    const items: FileItem[] = [];
    for (const m of allMessages) {
      const sender = m.from_tutor_name || "Unknown";
      for (const f of m.file_attachments || []) {
        if (
          !f.content_type?.startsWith("audio/") &&
          !f.content_type?.startsWith("video/") &&
          f.content_type !== "image/gif"
        ) {
          items.push({ url: f.url, filename: f.filename, content_type: f.content_type, date: m.created_at, sender });
        }
      }
    }
    return items.reverse();
  }, [allMessages]);

  // Collect links from message HTML
  const links = useMemo<LinkItem[]>(() => {
    const items: LinkItem[] = [];
    for (const m of allMessages) {
      const sender = m.from_tutor_name || "Unknown";
      const { urls } = extractUrls(m.message);
      for (const url of urls) {
        items.push({ url, domain: getDomain(url), date: m.created_at, sender });
      }
    }
    // Deduplicate by URL, keep first occurrence
    const seen = new Set<string>();
    return items.reverse().filter(l => {
      if (seen.has(l.url)) return false;
      seen.add(l.url);
      return true;
    });
  }, [allMessages]);

  // Group media by month
  const mediaByMonth = useMemo(() => {
    const groups = new Map<string, MediaItem[]>();
    for (const item of media) {
      const key = formatMonth(item.date);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    }
    return groups;
  }, [media]);

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "media", label: "Media", count: media.length },
    { key: "files", label: "Files", count: files.length },
    { key: "links", label: "Links", count: links.length },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Shared content</h3>
        <button
          onClick={onClose}
          className="p-1 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          title="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
        {tabs.map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn(
              "flex-1 py-2 text-xs font-medium transition-colors relative",
              activeTab === key
                ? "text-[#a0704b]"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            )}
          >
            {label}
            {count > 0 && (
              <span className={cn(
                "ml-1 text-[10px] tabular-nums",
                activeTab === key ? "text-[#a0704b]" : "text-gray-400"
              )}>
                {count}
              </span>
            )}
            {activeTab === key && (
              <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-[#a0704b] rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "media" && (
          media.length === 0 ? (
            <EmptyState icon={<ImageIcon className="h-8 w-8" />} text="No media shared" />
          ) : (
            <div className="p-2">
              {Array.from(mediaByMonth.entries()).map(([month, items]) => (
                <div key={month}>
                  <div className="text-[11px] font-medium text-gray-400 dark:text-gray-500 px-1 py-1.5">{month}</div>
                  <div className="grid grid-cols-3 gap-1">
                    {items.map((item, i) => {
                      const lightboxIdx = item.type !== "video" ? lightboxUrls.indexOf(item.url) : -1;
                      return (
                        <button
                          key={`${item.url}-${i}`}
                          type="button"
                          className="relative aspect-square rounded-md overflow-hidden bg-gray-100 dark:bg-gray-800 hover:opacity-90 transition-opacity"
                          onClick={() => {
                            if (item.type === "video") {
                              window.open(item.url, "_blank");
                            } else {
                              setLightboxIndex(lightboxIdx);
                            }
                          }}
                        >
                          {item.type === "video" ? (
                            <>
                              <video src={item.url} preload="metadata" className="w-full h-full object-cover" />
                              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                                <Play className="h-6 w-6 text-white fill-white" />
                              </div>
                            </>
                          ) : (
                            <img src={item.url} alt="" className="w-full h-full object-cover" loading="lazy" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {activeTab === "files" && (
          files.length === 0 ? (
            <EmptyState icon={<File className="h-8 w-8" />} text="No files shared" />
          ) : (
            <div className="p-2 space-y-1">
              {files.map((file, i) => (
                <a
                  key={`${file.url}-${i}`}
                  href={file.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-2.5 rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] bg-[#faf6f1]/50 dark:bg-[#1a1a1a]/50 hover:bg-[#f5ede3] dark:hover:bg-[#2d2820] transition-colors group"
                >
                  <div className="p-2 rounded-lg bg-[#f5ede3] dark:bg-[#3d3628] text-[#a0704b] flex-shrink-0">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{file.filename}</div>
                    <div className="text-[10px] text-gray-400 dark:text-gray-500">
                      {file.content_type.split("/").pop()?.toUpperCase()} · {file.sender} · {formatDate(file.date)}
                    </div>
                  </div>
                  <Download className="h-3.5 w-3.5 text-gray-400 group-hover:text-[#a0704b] transition-colors flex-shrink-0" />
                </a>
              ))}
            </div>
          )
        )}

        {activeTab === "links" && (
          links.length === 0 ? (
            <EmptyState icon={<Link2 className="h-8 w-8" />} text="No links shared" />
          ) : (
            <div className="p-2 space-y-1">
              {links.map((link, i) => (
                <a
                  key={`${link.url}-${i}`}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-2.5 rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] bg-[#faf6f1]/50 dark:bg-[#1a1a1a]/50 hover:bg-[#f5ede3] dark:hover:bg-[#2d2820] transition-colors group"
                >
                  <div className="p-2 rounded-lg bg-[#f5ede3] dark:bg-[#3d3628] text-[#a0704b] flex-shrink-0">
                    <ExternalLink className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{link.url}</div>
                    <div className="text-[10px] text-gray-400 dark:text-gray-500">
                      {link.domain} · {link.sender} · {formatDate(link.date)}
                    </div>
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 text-gray-400 group-hover:text-[#a0704b] transition-colors flex-shrink-0" />
                </a>
              ))}
            </div>
          )
        )}
      </div>

      {/* Image lightbox */}
      {lightboxIndex !== null && lightboxUrls.length > 0 && (
        <ImageLightbox
          images={lightboxUrls}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onChangeIndex={setLightboxIndex}
        />
      )}
    </div>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500">
      {icon}
      <span className="text-sm mt-2">{text}</span>
    </div>
  );
}
