"use client";

import { useState, useEffect } from "react";
import { ExternalLink } from "lucide-react";

interface LinkPreviewData {
  title?: string;
  description?: string;
  image?: string;
  domain: string;
}

// Client-side cache to avoid re-fetching across re-renders
const previewCache = new Map<string, LinkPreviewData | null>();

function extractUrls(html: string): string[] {
  const urls: string[] = [];
  // Extract from <a href="..."> tags
  const hrefRegex = /href="(https?:\/\/[^"]+)"/gi;
  let match;
  while ((match = hrefRegex.exec(html)) !== null) {
    urls.push(match[1]);
  }
  // Extract plain URLs not already in href
  const plainRegex = /(https?:\/\/[^\s<>"']+)/gi;
  while ((match = plainRegex.exec(html)) !== null) {
    if (!urls.includes(match[1])) {
      urls.push(match[1]);
    }
  }
  // Deduplicate and limit
  return [...new Set(urls)]
    .filter(u => !u.match(/\.(jpg|jpeg|png|gif|webp|svg|pdf|doc|docx|xls|xlsx)$/i))
    .slice(0, 3);
}

function SinglePreview({ url }: { url: string }) {
  const [data, setData] = useState<LinkPreviewData | null>(
    previewCache.get(url) ?? null
  );
  const [loaded, setLoaded] = useState(previewCache.has(url));
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    if (previewCache.has(url)) {
      setData(previewCache.get(url) ?? null);
      setLoaded(true);
      return;
    }

    let cancelled = false;
    fetch(`/internal/link-preview?url=${encodeURIComponent(url)}`)
      .then((resp) => {
        if (!resp.ok) throw new Error("Failed");
        return resp.json();
      })
      .then((result: LinkPreviewData) => {
        if (!cancelled) {
          previewCache.set(url, result);
          setData(result);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          previewCache.set(url, null);
          setLoaded(true);
        }
      });

    return () => { cancelled = true; };
  }, [url]);

  // Not loaded yet — subtle skeleton
  if (!loaded) {
    return (
      <div className="mt-2 rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] bg-[#faf6f1]/50 dark:bg-[#1a1a1a]/50 p-3 animate-pulse">
        <div className="h-3 w-2/3 bg-gray-200 dark:bg-gray-700 rounded" />
        <div className="h-2.5 w-full bg-gray-200 dark:bg-gray-700 rounded mt-2" />
      </div>
    );
  }

  // Failed or no useful data
  if (!data || (!data.title && !data.description)) {
    return null;
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 flex gap-3 rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] bg-[#faf6f1]/50 dark:bg-[#1a1a1a]/50 p-2.5 hover:bg-[#f5ede3]/80 dark:hover:bg-[#2a2a2a]/80 transition-colors no-underline group overflow-hidden"
    >
      {data.image && !imgError && (
        <img
          src={data.image}
          alt=""
          className="w-16 h-16 rounded object-cover flex-shrink-0"
          onError={() => setImgError(true)}
        />
      )}
      <div className="flex-1 min-w-0">
        {data.title && (
          <div className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate group-hover:text-[#a0704b] transition-colors">
            {data.title}
          </div>
        )}
        {data.description && (
          <div className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-2 mt-0.5 leading-relaxed">
            {data.description}
          </div>
        )}
        <div className="flex items-center gap-1 mt-1 text-[10px] text-gray-400 dark:text-gray-500">
          <ExternalLink className="w-2.5 h-2.5" />
          <span>{data.domain}</span>
        </div>
      </div>
    </a>
  );
}

export function LinkPreview({ messageHtml }: { messageHtml: string }) {
  const urls = extractUrls(messageHtml);

  if (urls.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {urls.map((url) => (
        <SinglePreview key={url} url={url} />
      ))}
    </div>
  );
}
