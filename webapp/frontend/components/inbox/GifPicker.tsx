"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Search, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { messagesAPI } from "@/lib/api";
import FloatingDropdown from "@/components/inbox/FloatingDropdown";
import { useHaptic } from "@/lib/useHaptic";

interface GifResult {
  id: string;
  url: string;
  preview_url: string;
  width: number;
  height: number;
  title: string;
}

interface GifPickerProps {
  onSelect: (url: string, title: string) => void;
  className?: string;
}

export default function GifPicker({ onSelect, className }: GifPickerProps) {
  const haptic = useHaptic();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [gifs, setGifs] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const fetchRef = useRef(0);

  const fetchGifs = useCallback(async (searchQuery: string) => {
    const id = ++fetchRef.current;
    setLoading(true);
    setError("");
    try {
      const results = searchQuery.trim()
        ? await messagesAPI.gifSearch(searchQuery.trim())
        : await messagesAPI.gifTrending();
      if (fetchRef.current === id) {
        setGifs(results);
      }
    } catch {
      if (fetchRef.current === id) {
        setError("Failed to load GIFs");
        setGifs([]);
      }
    } finally {
      if (fetchRef.current === id) {
        setLoading(false);
      }
    }
  }, []);

  // Reset state on close, focus input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery("");
      setGifs([]);
      setError("");
    }
  }, [isOpen]);

  // Debounced search (also handles initial trending load on open)
  useEffect(() => {
    if (!isOpen) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchGifs(query), query ? 300 : 0);
    return () => clearTimeout(debounceRef.current);
  }, [query, isOpen, fetchGifs]);

  const handleSelect = (gif: GifResult) => {
    haptic.trigger("light");
    onSelect(gif.url, gif.title || "GIF");
    setIsOpen(false);
  };

  return (
    <div className={cn(className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="p-1.5 text-gray-400 hover:text-[#a0704b] hover:bg-[#ede0cf] dark:hover:bg-[#3d2e1e] rounded transition-colors"
        title="Send GIF"
      >
        <span className="h-[18px] w-[18px] flex items-center justify-center text-[10px] font-bold leading-none">GIF</span>
      </button>

      <FloatingDropdown
        triggerRef={triggerRef}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        align="right"
        className="bg-white dark:bg-[#2a2a2a] rounded-lg shadow-lg border border-[#e8d4b8] dark:border-[#6b5a4a] w-[340px] flex flex-col"
      >
        {/* Search bar */}
        <div className="p-2 border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search GIFs..."
              className="w-full pl-7 pr-7 py-1.5 text-sm bg-[#f5ede3] dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-md text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-[#a0704b]"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* GIF grid */}
        <div className="overflow-y-auto max-h-[300px] p-1.5">
          {loading && gifs.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-[#a0704b]" />
            </div>
          ) : error ? (
            <p className="text-center text-sm text-gray-400 py-8">{error}</p>
          ) : gifs.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-8">No GIFs found</p>
          ) : (
            <div className="grid grid-cols-2 gap-1.5">
              {gifs.map((gif) => (
                <button
                  key={gif.id}
                  type="button"
                  onClick={() => handleSelect(gif)}
                  className="relative overflow-hidden rounded-md hover:ring-2 hover:ring-[#a0704b] transition-all bg-gray-100 dark:bg-[#1a1a1a]"
                  style={{ aspectRatio: `${gif.width} / ${gif.height}`, maxHeight: "150px" }}
                >
                  <img
                    src={gif.preview_url}
                    alt={gif.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* GIPHY attribution */}
        <div className="px-2 py-1.5 border-t border-[#e8d4b8] dark:border-[#6b5a4a] flex items-center justify-center">
          <span className="text-[10px] text-gray-400">Powered by GIPHY</span>
        </div>
      </FloatingDropdown>
    </div>
  );
}
