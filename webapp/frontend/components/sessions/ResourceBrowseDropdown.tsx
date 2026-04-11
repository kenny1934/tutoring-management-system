"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Compass, ExternalLink, ChevronDown } from "lucide-react";

const RESOURCES = [
  {
    name: "YouTube",
    url: "https://www.youtube.com",
    color: "#ef4444",
    embed: true,
    linkFormat: "youtube.com/watch?v=...",
    hint: "Embeds video player inline",
  },
  {
    name: "Google Slides",
    url: "https://slides.google.com",
    color: "#eab308",
    embed: true,
    linkFormat: "docs.google.com/presentation/d/.../edit",
    hint: "Embeds slide viewer inline",
  },
  {
    name: "Google Docs",
    url: "https://docs.google.com",
    color: "#4285f4",
    embed: true,
    linkFormat: "docs.google.com/document/d/.../edit",
    hint: "Embeds document preview inline",
  },
  {
    name: "Desmos",
    url: "https://www.desmos.com/calculator",
    color: "#22c55e",
    embed: true,
    linkFormat: "desmos.com/calculator/...",
    hint: "Embeds interactive graph inline",
  },
  {
    name: "GeoGebra",
    url: "https://www.geogebra.org/materials",
    color: "#14b8a6",
    embed: true,
    linkFormat: "geogebra.org/m/...",
    hint: "Embeds interactive tool inline",
  },
  {
    name: "PhET",
    url: "https://phet.colorado.edu/en/simulations/filter?subjects=math-and-statistics",
    color: "#f97316",
    embed: true,
    linkFormat: "phet.colorado.edu/en/simulations/...",
    hint: "Embeds simulation inline",
  },
  {
    name: "Kahoot",
    url: "https://create.kahoot.it/discover",
    color: "#8b5cf6",
    embed: true,
    linkFormat: "create.kahoot.it/details/...",
    hint: "Embeds quiz preview card",
  },
  {
    name: "Polypad",
    url: "https://polypad.amplify.com",
    color: "#06b6d4",
    embed: true,
    linkFormat: "Paste the embed code or URL",
    hint: "Embeds interactive manipulatives inline",
  },
  {
    name: "Wayground",
    url: "https://wayground.com/admin/resource-library/curriculums/mathematics",
    color: "#ec4899",
    embed: false,
    linkFormat: "wayground.com/.../quiz/...",
    hint: "Opens in new tab",
  },
];

export function ResourceBrowseDropdown() {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false); // controls mount/unmount with exit delay
  const [closing, setClosing] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const doClose = useCallback(() => {
    setClosing(true);
    setTimeout(() => {
      setOpen(false);
      setVisible(false);
      setClosing(false);
    }, 120);
  }, []);

  const toggle = useCallback(() => {
    if (open) {
      doClose();
    } else {
      setOpen(true);
      setVisible(true);
    }
  }, [open, doClose]);

  const updatePosition = useCallback(() => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const dropH = 420;
    const dropW = 320;

    const top = rect.top > dropH
      ? rect.top - dropH - 4
      : rect.bottom + 4;

    let left = rect.right - dropW;
    if (left < 8) left = 8;
    if (left + dropW > window.innerWidth - 8) left = window.innerWidth - dropW - 8;

    setPos({ top, left });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const handleClick = (e: MouseEvent) => {
      if (dropRef.current?.contains(e.target as Node)) return;
      if (btnRef.current?.contains(e.target as Node)) return;
      doClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") doClose();
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open, updatePosition, doClose]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="true"
        className="flex items-center gap-0.5 px-1.5 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex-shrink-0"
        title="Browse educational resources"
      >
        <Compass className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400" />
        <ChevronDown className={`h-2.5 w-2.5 text-gray-400 dark:text-gray-500 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {visible && pos && createPortal(
        <div
          ref={dropRef}
          className="fixed z-[9999] w-80 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl overflow-hidden"
          style={{
            top: pos.top,
            left: pos.left,
            animation: closing
              ? "resource-dropdown-out 120ms ease-in forwards"
              : "resource-dropdown-in 150ms ease-out",
          }}
        >
          <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
            <p className="text-[11px] font-medium text-gray-700 dark:text-gray-300">
              Browse Resources
            </p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
              Open a site, find content, copy the link, paste it here
            </p>
          </div>

          <div className="max-h-[320px] overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
            {RESOURCES.map((r) => (
              <a
                key={r.name}
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={doClose}
                className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group"
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: r.color }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-medium text-gray-900 dark:text-gray-100">
                      {r.name}
                    </span>
                    <ExternalLink className="h-2.5 w-2.5 text-gray-300 dark:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <code className="text-[9px] text-gray-400 dark:text-gray-500 truncate">
                      {r.linkFormat}
                    </code>
                    <span className="text-[9px] text-gray-400 dark:text-gray-500 flex-shrink-0">
                      &middot; {r.hint}
                    </span>
                  </div>
                </div>
              </a>
            ))}
          </div>

          <div className="px-3 py-1.5 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/30">
            <p className="text-[9px] text-gray-400 dark:text-gray-500 text-center">
              Any URL works &mdash; unsupported sites open in new tab
            </p>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
