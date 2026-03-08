"use client";

import { useState, useMemo, useCallback } from "react";
import { X, FileText, Download, ExternalLink, Play, Image as ImageIcon, File, Link2, Copy, Radical, Triangle } from "lucide-react";
import katex from "katex";
import { cn } from "@/lib/utils";
import { useToast } from "@/contexts/ToastContext";
import ImageLightbox from "@/components/inbox/ImageLightbox";
import GeometryViewerModal from "@/components/inbox/GeometryViewerModal";
import { extractUrls } from "@/components/inbox/LinkPreview";
import { unescapeHtmlEntities, normalizeDisplaylines } from "@/lib/html-utils";
import type { MessageThread } from "@/types";

type Tab = "media" | "files" | "links" | "math" | "graphs";

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

interface MathItem {
  latex: string;
  rendered: string;
  displayMode: boolean;
  date: string;
  sender: string;
}

interface GraphItem {
  graphJson: string;
  svgThumbnail: string;
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
}

export default function ThreadMediaPanel({ thread, onClose }: ThreadMediaPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>("media");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [viewerGraphJson, setViewerGraphJson] = useState<string | null>(null);
  const { showToast } = useToast();

  const allMessages = useMemo(
    () => [thread.root_message, ...thread.replies.filter(r => r.id > 0)],
    [thread.root_message, thread.replies]
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

  // Image URLs for lightbox (only images + GIFs, not videos) + O(1) index lookup
  const { lightboxUrls, lightboxIndexMap } = useMemo(() => {
    const urls: string[] = [];
    const indexMap = new Map<string, number>();
    for (const item of media) {
      if (item.type !== "video") {
        indexMap.set(item.url, urls.length);
        urls.push(item.url);
      }
    }
    return { lightboxUrls: urls, lightboxIndexMap: indexMap };
  }, [media]);

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
      const { urls } = extractUrls(m.message, Infinity);
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

  // Collect math equations from message HTML (pre-render KaTeX to avoid work during render)
  const mathItems = useMemo<MathItem[]>(() => {
    const items: MathItem[] = [];
    const regex = /<(?:span|div)[^>]*data-type="(inline|block)-math"[^>]*>.*?<\/(?:span|div)>/gs;
    for (const m of allMessages) {
      const sender = m.from_tutor_name || "Unknown";
      regex.lastIndex = 0;
      let match;
      while ((match = regex.exec(m.message)) !== null) {
        const latexMatch = match[0].match(/data-latex="([^"]*)"/);
        if (!latexMatch) continue;
        const latex = unescapeHtmlEntities(latexMatch[1]);
        const displayMode = match[1] === "block";
        let rendered: string;
        try {
          rendered = katex.renderToString(normalizeDisplaylines(latex), { throwOnError: false, displayMode });
        } catch {
          rendered = latex;
        }
        items.push({ latex, rendered, displayMode, date: m.created_at, sender });
      }
    }
    return items.reverse();
  }, [allMessages]);

  // Collect geometry diagrams from message HTML
  const graphItems = useMemo<GraphItem[]>(() => {
    const items: GraphItem[] = [];
    const regex = /<div[^>]*data-type="geometry-diagram"[^>]*>/gs;
    for (const m of allMessages) {
      const sender = m.from_tutor_name || "Unknown";
      regex.lastIndex = 0;
      let match;
      while ((match = regex.exec(m.message)) !== null) {
        const tag = match[0];
        const jsonMatch = tag.match(/data-graph-json="([^"]*)"/);
        const thumbMatch = tag.match(/data-svg-thumbnail="([^"]*)"/);
        if (jsonMatch?.[1]) {
          items.push({
            graphJson: unescapeHtmlEntities(jsonMatch[1]),
            svgThumbnail: thumbMatch?.[1] || "",
            date: m.created_at,
            sender,
          });
        }
      }
    }
    return items.reverse();
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

  const handleCopyLatex = useCallback(async (latex: string) => {
    await navigator.clipboard.writeText(latex);
    showToast("LaTeX copied to clipboard", "info");
  }, [showToast]);

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "media", label: "Media", count: media.length },
    { key: "files", label: "Files", count: files.length },
    { key: "links", label: "Links", count: links.length },
    { key: "math", label: "Math", count: mathItems.length },
    { key: "graphs", label: "Graphs", count: graphItems.length },
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
                      const lightboxIdx = item.type !== "video" ? (lightboxIndexMap.get(item.url) ?? -1) : -1;
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
                              <video src={item.url} preload="none" className="w-full h-full object-cover" />
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

        {activeTab === "math" && (
          mathItems.length === 0 ? (
            <EmptyState icon={<Radical className="h-8 w-8" />} text="No equations shared" />
          ) : (
            <div className="p-2 space-y-1.5">
              {mathItems.map((item, i) => (
                <button
                  key={`math-${i}`}
                  type="button"
                  onClick={() => handleCopyLatex(item.latex)}
                  className="w-full text-left p-3 rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] bg-[#faf6f1]/50 dark:bg-[#1a1a1a]/50 hover:bg-[#f5ede3] dark:hover:bg-[#2d2820] transition-colors group"
                >
                  <div
                    className="overflow-x-auto text-sm [&_.katex]:text-base"
                    dangerouslySetInnerHTML={{ __html: item.rendered }}
                  />
                  <div className="flex items-center justify-between mt-2">
                    <div className="text-[10px] text-gray-400 dark:text-gray-500">
                      {item.sender} · {formatDate(item.date)}
                    </div>
                    <Copy className="h-3 w-3 text-gray-300 dark:text-gray-600 group-hover:text-[#a0704b] transition-colors" />
                  </div>
                </button>
              ))}
            </div>
          )
        )}

        {activeTab === "graphs" && (
          graphItems.length === 0 ? (
            <EmptyState icon={<Triangle className="h-8 w-8" />} text="No graphs shared" />
          ) : (
            <div className="p-2 grid grid-cols-2 gap-1.5">
              {graphItems.map((item, i) => (
                <button
                  key={`graph-${i}`}
                  type="button"
                  onClick={() => setViewerGraphJson(item.graphJson)}
                  className="rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] bg-[#faf6f1]/50 dark:bg-[#1a1a1a]/50 hover:bg-[#f5ede3] dark:hover:bg-[#2d2820] transition-colors overflow-hidden group"
                >
                  <div className="aspect-[4/3] bg-white dark:bg-[#1a1a1a] flex items-center justify-center p-1">
                    {item.svgThumbnail ? (
                      <img src={item.svgThumbnail} alt="Geometry diagram" className="w-full h-full object-contain" />
                    ) : (
                      <Triangle className="h-8 w-8 text-gray-300 dark:text-gray-600" />
                    )}
                  </div>
                  <div className="px-2 py-1.5 text-[10px] text-gray-400 dark:text-gray-500 truncate">
                    {item.sender} · {formatDate(item.date)}
                  </div>
                </button>
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

      {/* Geometry viewer modal */}
      {viewerGraphJson && (
        <GeometryViewerModal
          isOpen={true}
          onClose={() => setViewerGraphJson(null)}
          graphJson={viewerGraphJson}
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
